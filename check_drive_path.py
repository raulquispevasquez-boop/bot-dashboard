import os

drive_path = r"G:\Mi unidad\1.APLICACIONES\Data variables climaticas"
bot_path = r"E:\bot-dashboard\backend\bots\bot_clima_spsa"

print("--- Checking Drive Path ---")
print(f"Drive Path: {drive_path}")
print(f"Exists: {os.path.exists(drive_path)}")
if os.path.exists(drive_path):
    print("Files in Drive Path:")
    try:
        files = os.listdir(drive_path)
        for f in files[:10]:
            print(f" - {f}")
    except Exception as e:
        print(f" Error listing: {e}")

print("\n--- Checking Bot Path ---")
print(f"Bot Path: {bot_path}")
print("Excel/CSV files in Bot Path:")
try:
    files = os.listdir(bot_path)
    for f in files:
        if f.endswith(".xlsx") or f.endswith(".csv"):
            print(f" - {f} ({os.path.getsize(os.path.join(bot_path, f)) / 1024:.2f} KB)")
except Exception as e:
    print(f" Error listing: {e}")
