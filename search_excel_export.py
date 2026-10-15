import sys
sys.stdout.reconfigure(encoding='utf-8')

with open(r"E:\bot-dashboard\backend\bots\bot_clima_spsa\bot_clima_spsa_v1_LIBRE.py", 'r', encoding='utf-8') as f:
    lines = f.readlines()

for idx, line in enumerate(lines):
    if any(k in line.lower() for k in ["excel", "xlsx", "to_excel", "to_csv", "drive", "gdrive", "carpeta_drive"]):
        print(f"Line {idx+1}: {line.strip()}")
