import sys
import warnings
warnings.filterwarnings('ignore')

import bot_auditoria_en

if __name__ == "__main__":
    try:
        if sys.stdout.encoding.lower() != 'utf-8':
            sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

    try:
        bot_auditoria_en.main()
    except Exception as e:
        import json
        print(f"[{json.dumps({'type': 'error', 'message': f'Error crítico en wrapper: {str(e)}'})}]")
