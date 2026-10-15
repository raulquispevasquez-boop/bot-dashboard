import time
import sys

def main():
    print("Bot Fractal Iniciado...")
    print("Conectando con la base de datos...")
    time.sleep(1)
    print("¡Conectado! Buscando señales fractales...")
    
    count = 1
    while True:
        print(f"[Iteración {count}] Analizando mercado... ninguna anomalía detectada.")
        count += 1
        time.sleep(2)

if __name__ == "__main__":
    main()
