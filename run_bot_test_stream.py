import json
import os
import subprocess
import sys

config_path = r"E:\bot-dashboard\backend\bots\bot_clima_spsa\config_clima.json"
wrapper_path = r"E:\bot-dashboard\backend\bots\bot_clima_spsa\wrapper.py"
python_path = r"E:\bot-dashboard\python_env\python\python.exe"

# 1. Read existing config
with open(config_path, 'r', encoding='utf-8') as f:
    config = json.load(f)

# Save original dates to restore later
orig_ini = config.get("f_ini")
orig_fin = config.get("f_fin")

# 2. Modify config for a quick test run (last 2 days)
config["f_ini"] = "2026-07-16"
config["f_fin"] = "2026-07-18"

with open(config_path, 'w', encoding='utf-8') as f:
    json.dump(config, f, indent=2)

print(f"Temporary config dates set to: {config['f_ini']} to {config['f_fin']}")
sys.stdout.flush()

# 3. Run the bot wrapper in streaming mode
print("Running bot wrapper with stream...")
sys.stdout.flush()

try:
    proc = subprocess.Popen(
        [python_path, "-u", wrapper_path],
        cwd=r"E:\bot-dashboard",
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding='utf-8',
        errors='ignore'
    )
    
    # Read output line by line as it becomes available
    while True:
        line = proc.stdout.readline()
        if not line and proc.poll() is not None:
            break
        if line:
            print(f"[BOT STDOUT] {line.strip()}")
            sys.stdout.flush()
            
    # Read remaining stderr
    stderr_content = proc.stderr.read()
    if stderr_content:
        print("\n--- STDERR ---")
        print(stderr_content)
        sys.stdout.flush()
        
    print(f"Process finished with exit code: {proc.returncode}")
    sys.stdout.flush()
finally:
    # 4. Restore original config
    config["f_ini"] = orig_ini
    config["f_fin"] = orig_fin
    with open(config_path, 'w', encoding='utf-8') as f:
        json.dump(config, f, indent=2)
    print("Original config dates restored.")
    sys.stdout.flush()
