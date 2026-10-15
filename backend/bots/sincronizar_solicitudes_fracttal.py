import pme_common
import json

def main():
    try:
        pme_common.log("Iniciando consolidación de solicitudes Fracttal para la cascada PME...")
        pme_common.sincronizar_solicitudes_fracttal()
        pme_common.log("✅ Consolidación de solicitudes Fracttal completada.")
    except Exception as e:
        pme_common.log(f"⚠️ Fracttal: error al sincronizar solicitudes consolidadas: {e}")

if __name__ == "__main__":
    main()
