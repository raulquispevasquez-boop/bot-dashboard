import json
import os

path = r"E:\bot-dashboard\backend\senamhi_history.json"
if os.path.exists(path):
    try:
        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            print(f"Total records: {len(data)}")
            if len(data) > 0:
                print("First record sample keys:", data[0].keys())
                print("First record sample:", data[0])
            fuentes = set()
            for r in data:
                for key in r.keys():
                    if 'fuente' in key or 'source' in key:
                        fuentes.add(f"{key}: {r[key]}")
            print("Unique values related to source:")
            for f in fuentes:
                print(f" - {f}")
    except Exception as e:
        print("Error reading JSON:", e)
else:
    print("File not found")
