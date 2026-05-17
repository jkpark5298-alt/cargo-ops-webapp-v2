from typing import List
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', extra='ignore')

    app_name: str = Field(default='Cargo Ops Backend', alias='APP_NAME')
    app_env: str = Field(default='development', alias='APP_ENV')
    app_cors_origins: str = Field(default='http://localhost:3000', alias='APP_CORS_ORIGINS')

    google_application_credentials_json: str | None = Field(default=None, alias='GOOGLE_APPLICATION_CREDENTIALS_JSON')
    google_cloud_project: str | None = Field(default=None, alias='GOOGLE_CLOUD_PROJECT')

    incheon_api_service_key: str | None = Field(default=None, alias='INCHEON_API_SERVICE_KEY')
    incheon_api_base_url: str = Field(
        default='https://apis.data.go.kr/B551177/StatusOfCargoFlightsDeOdp/getCargoFlightOdp',
        alias='INCHEON_API_BASE_URL',
    )
    incheon_api_response_type: str = Field(default='json', alias='INCHEON_API_RESPONSE_TYPE')

    @property
    def cors_origins(self) -> List[str]:
        return [item.strip() for item in self.app_cors_origins.split(',') if item.strip()]


settings = Settings()
