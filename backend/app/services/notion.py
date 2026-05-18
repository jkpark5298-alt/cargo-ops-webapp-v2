import base64
import os
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import HTTPException

NOTION_API_BASE = "https://api.notion.com/v1"
NOTION_VERSION = os.getenv("NOTION_VERSION", "2026-03-11")
MAX_IMAGE_BYTES = int(os.getenv("NOTION_MAX_IMAGE_BYTES", str(20 * 1024 * 1024)))


def _notion_token() -> str:
    token = os.getenv("NOTION_TOKEN", "").strip()
    if not token:
        raise HTTPException(status_code=500, detail="NOTION_TOKEN is not configured")
    return token


def _daily_database_id() -> str:
    database_id = os.getenv("NOTION_DAILY_DATABASE_ID", "").strip()
    if not database_id:
        raise HTTPException(status_code=500, detail="NOTION_DAILY_DATABASE_ID is not configured")
    return database_id


def _issue_database_id() -> str:
    database_id = os.getenv("NOTION_ISSUE_DATABASE_ID", "").strip()
    if not database_id:
        raise HTTPException(status_code=500, detail="NOTION_ISSUE_DATABASE_ID is not configured")
    return database_id


def _notion_database_url(database_id: str) -> str:
    compact_id = database_id.replace("-", "").strip()
    return f"https://www.notion.so/{compact_id}"


def get_notion_links() -> dict[str, Any]:
    return {
        "success": True,
        "dailyDbUrl": _notion_database_url(_daily_database_id()),
        "issueDbUrl": _notion_database_url(_issue_database_id()),
    }


def _headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {_notion_token()}",
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
    }


def _rich_text(value: str | None) -> dict[str, Any]:
    return {"rich_text": [{"text": {"content": value or ""}}]}


def _title(value: str | None) -> dict[str, Any]:
    return {"title": [{"text": {"content": value or "제목 없음"}}]}


def _select(value: str | None) -> dict[str, Any]:
    return {"select": {"name": value or "확인 중"}}


def _date(value: str | None) -> dict[str, Any]:
    if not value:
        value = datetime.now(timezone.utc).date().isoformat()

    date_text = str(value).strip()
    if "T" in date_text:
        date_text = date_text.split("T", 1)[0]
    if " " in date_text:
        date_text = date_text.split(" ", 1)[0]

    return {"date": {"start": date_text}}


def _text_property(value: str | None) -> dict[str, Any]:
    return _rich_text(value)


def _image_memo_property_name(image: dict[str, Any]) -> str | None:
    image_type = image.get("type")
    property_name = image.get("propertyName")

    if image_type == "daily-schedule" or property_name == "업무일정 이미지":
        return "업무 일정 메모"
    if image_type == "aircraft-check" or property_name == "화물기 CHECK 이미지":
        return "화물기 CHECK 메모"
    if image_type == "inspection-result" or property_name == "점검 대상 결과 이미지":
        return "점검결과 메모"
    if image_type == "issue" or property_name == "이미지":
        return "특이사항 메모"

    return None


def _format_image_memo_entry(index: int, image: dict[str, Any], memo: str) -> str:
    saved_at = str(image.get("savedAt") or "").strip()
    label = str(image.get("label") or "").strip()

    lines = [f"[{index}]"]
    if saved_at:
        lines.append(f"저장일시: {saved_at}")
    if label:
        lines.append(f"사진: {label}")
    lines.append(f"메모: {memo}")

    return "\n".join(lines)


def _memo_properties_for_images(images: list[dict[str, Any]]) -> dict[str, Any]:
    memo_groups: dict[str, list[str]] = {}
    memo_counts: dict[str, int] = {}

    for image in images:
        if not isinstance(image, dict):
            continue

        memo = str(image.get("memo") or "").strip()
        if not memo:
            continue

        property_name = _image_memo_property_name(image)
        if not property_name:
            continue

        memo_counts[property_name] = memo_counts.get(property_name, 0) + 1
        memo_groups.setdefault(property_name, []).append(
            _format_image_memo_entry(memo_counts[property_name], image, memo)
        )

    return {
        property_name: _text_property("\n\n".join(entries))
        for property_name, entries in memo_groups.items()
    }


def _parse_data_url(data_url: str) -> tuple[str, bytes]:
    if not data_url or "," not in data_url:
        raise ValueError("Invalid image data URL")

    header, encoded = data_url.split(",", 1)
    content_type = "image/jpeg"

    if header.startswith("data:") and ";" in header:
        content_type = header[5:].split(";", 1)[0] or content_type

    binary = base64.b64decode(encoded)

    if len(binary) > MAX_IMAGE_BYTES:
        raise ValueError("Image is too large for Notion upload")

    return content_type, binary


def _extension_from_content_type(content_type: str) -> str:
    if "png" in content_type:
        return "png"
    if "webp" in content_type:
        return "webp"
    if "gif" in content_type:
        return "gif"
    return "jpg"


async def _upload_image(
    client: httpx.AsyncClient,
    image: dict[str, Any],
    fallback_name: str,
) -> dict[str, Any] | None:
    data_url = image.get("dataUrl")
    if not data_url:
        return None

    try:
        content_type, binary = _parse_data_url(data_url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    extension = _extension_from_content_type(content_type)
    safe_name = (image.get("label") or fallback_name).replace("/", "-").replace("\\", "-")
    filename = f"{safe_name[:80]}.{extension}"

    create_res = await client.post(
        f"{NOTION_API_BASE}/file_uploads",
        headers=_headers(),
        json={},
    )
    if create_res.status_code >= 400:
        raise HTTPException(
            status_code=502,
            detail=f"Notion file upload create failed: {create_res.text}",
        )

    upload_object = create_res.json()
    upload_id = upload_object.get("id")
    upload_url = upload_object.get("upload_url")

    if not upload_id or not upload_url:
        raise HTTPException(status_code=502, detail="Notion file upload response is invalid")

    send_headers = {
        "Authorization": f"Bearer {_notion_token()}",
        "Notion-Version": NOTION_VERSION,
    }

    send_res = await client.post(
        upload_url,
        headers=send_headers,
        files={"file": (filename, binary, content_type)},
    )
    if send_res.status_code >= 400:
        raise HTTPException(
            status_code=502,
            detail=f"Notion file upload send failed: {send_res.text}",
        )

    return {
        "name": filename,
        "type": "file_upload",
        "file_upload": {"id": upload_id},
    }


async def _upload_files_for_properties(
    client: httpx.AsyncClient,
    images: list[dict[str, Any]],
) -> dict[str, Any]:
    file_properties: dict[str, list[dict[str, Any]]] = {}

    for index, image in enumerate(images):
        if not isinstance(image, dict):
            continue

        property_name = image.get("propertyName")
        if not property_name:
            continue

        uploaded_file = await _upload_image(
            client,
            image,
            fallback_name=f"notion-image-{index + 1}",
        )

        if uploaded_file:
            file_properties.setdefault(property_name, []).append(uploaded_file)

    return {name: {"files": files} for name, files in file_properties.items()}


async def create_daily_record(payload: dict[str, Any]) -> dict[str, Any]:
    images = payload.get("images") or []
    if not isinstance(images, list):
        images = []

    async with httpx.AsyncClient(timeout=60) as client:
        image_properties = await _upload_files_for_properties(client, images)
        memo_properties = _memo_properties_for_images(images)

        properties: dict[str, Any] = {
            "제목": _title(payload.get("title")),
            "날짜": _date(payload.get("date")),
            "작성자": _text_property(payload.get("author")),
            "상태": _select(payload.get("status") or "이상 없음"),
            "주요 사항": _text_property(payload.get("memo")),
            **image_properties,
            **memo_properties,
        }

        response = await client.post(
            f"{NOTION_API_BASE}/pages",
            headers=_headers(),
            json={
                "parent": {"database_id": _daily_database_id()},
                "properties": properties,
            },
        )

    if response.status_code >= 400:
        raise HTTPException(
            status_code=502,
            detail=f"Notion daily record create failed: {response.text}",
        )

    result = response.json()
    return {
        "success": True,
        "message": "Daily record saved to Notion",
        "pageId": result.get("id"),
        "url": result.get("url"),
    }


async def update_daily_record(page_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    images = payload.get("images") or []
    if not isinstance(images, list):
        images = []

    async with httpx.AsyncClient(timeout=60) as client:
        image_properties = await _upload_files_for_properties(client, images)
        memo_properties = _memo_properties_for_images(images)

        properties: dict[str, Any] = {
            "제목": _title(payload.get("title")),
            "날짜": _date(payload.get("date")),
            "작성자": _text_property(payload.get("author")),
            "상태": _select(payload.get("status") or "이상 없음"),
            "주요 사항": _text_property(payload.get("memo")),
            **image_properties,
            **memo_properties,
        }

        response = await client.patch(
            f"{NOTION_API_BASE}/pages/{page_id}",
            headers=_headers(),
            json={"properties": properties},
        )

    if response.status_code >= 400:
        raise HTTPException(
            status_code=502,
            detail=f"Notion daily record update failed: {response.text}",
        )

    result = response.json()
    return {
        "success": True,
        "message": "Daily record updated in Notion",
        "pageId": result.get("id"),
        "url": result.get("url"),
    }


async def delete_daily_record(page_id: str) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.patch(
            f"{NOTION_API_BASE}/pages/{page_id}",
            headers=_headers(),
            json={"in_trash": True},
        )

    if response.status_code >= 400:
        raise HTTPException(
            status_code=502,
            detail=f"Notion daily record trash failed: {response.text}",
        )

    result = response.json()
    return {
        "success": True,
        "message": "Daily record deleted from Notion",
        "pageId": result.get("id"),
        "in_trash": result.get("in_trash", True),
    }


async def create_issue_record(payload: dict[str, Any]) -> dict[str, Any]:
    image = payload.get("image")
    images = [image] if isinstance(image, dict) else []

    async with httpx.AsyncClient(timeout=60) as client:
        image_properties = await _upload_files_for_properties(client, images)
        memo_properties = _memo_properties_for_images(images)

        properties: dict[str, Any] = {
            "제목": _title(payload.get("title")),
            "날짜": _date(payload.get("date")),
            "시간": _text_property(payload.get("time")),
            "편명": _text_property(payload.get("flight")),
            "구간": _text_property(payload.get("route")),
            "HL NBR": _text_property(payload.get("hlnbr")),
            "특이사항": _text_property(payload.get("issue")),
            "날씨": _text_property(payload.get("weather")),
            "작성자": _text_property(payload.get("author")),
            "상태": _select(payload.get("status") or "확인 중"),
            **image_properties,
            **memo_properties,
        }

        response = await client.post(
            f"{NOTION_API_BASE}/pages",
            headers=_headers(),
            json={
                "parent": {"database_id": _issue_database_id()},
                "properties": properties,
            },
        )

    if response.status_code >= 400:
        raise HTTPException(
            status_code=502,
            detail=f"Notion issue record create failed: {response.text}",
        )

    result = response.json()
    return {
        "success": True,
        "message": "Issue record saved to Notion",
        "pageId": result.get("id"),
        "url": result.get("url"),
    }



async def update_issue_record(page_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    image = payload.get("image")
    images = [image] if isinstance(image, dict) else []

    async with httpx.AsyncClient(timeout=60) as client:
        image_properties = await _upload_files_for_properties(client, images)
        memo_properties = _memo_properties_for_images(images)

        properties: dict[str, Any] = {
            "제목": _title(payload.get("title")),
            "날짜": _date(payload.get("date")),
            "시간": _text_property(payload.get("time")),
            "편명": _text_property(payload.get("flight")),
            "구간": _text_property(payload.get("route")),
            "HL NBR": _text_property(payload.get("hlnbr")),
            "특이사항": _text_property(payload.get("issue")),
            "날씨": _text_property(payload.get("weather")),
            "작성자": _text_property(payload.get("author")),
            "상태": _select(payload.get("status") or "확인 중"),
            **image_properties,
            **memo_properties,
        }

        response = await client.patch(
            f"{NOTION_API_BASE}/pages/{page_id}",
            headers=_headers(),
            json={"properties": properties},
        )

    if response.status_code >= 400:
        raise HTTPException(
            status_code=502,
            detail=f"Notion issue record update failed: {response.text}",
        )

    result = response.json()
    return {
        "success": True,
        "message": "Issue record updated in Notion",
        "pageId": result.get("id"),
        "url": result.get("url"),
    }


async def delete_issue_record(page_id: str) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.patch(
            f"{NOTION_API_BASE}/pages/{page_id}",
            headers=_headers(),
            json={"in_trash": True},
        )

    if response.status_code >= 400:
        raise HTTPException(
            status_code=502,
            detail=f"Notion issue record delete failed: {response.text}",
        )

    result = response.json()
    return {
        "success": True,
        "message": "Issue record deleted from Notion",
        "pageId": result.get("id"),
        "in_trash": result.get("in_trash", True),
    }
