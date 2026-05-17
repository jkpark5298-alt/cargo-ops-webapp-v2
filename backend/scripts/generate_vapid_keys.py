from pywebpush import WebPusher

keys = WebPusher.generate_vapid_keys()

print("WEB_PUSH_PUBLIC_KEY=" + keys["publicKey"])
print("WEB_PUSH_PRIVATE_KEY=" + keys["privateKey"])
print("WEB_PUSH_SUBJECT=mailto:your-email@example.com")
