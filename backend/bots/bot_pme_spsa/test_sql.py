import pyodbc

# Configuración del servidor SQL de PME
server = r'10.30.4.124\ION'
database = 'ION_Data'
username = 'bot_energia'
password = 'EnergiaBot.2026*'

def test_sql_connection():
    try:
        print(f"[TEST SQL] Conectando a {server}...")
        # Conexión maestra usando el puerto dinámico descubierto (64729)
        server_with_port = '10.30.4.124,64729'
        cnxn = pyodbc.connect(
            f'DRIVER={{SQL Server}};'
            f'SERVER={server_with_port};DATABASE={database};'
            f'UID={username};PWD={password};',
            timeout=5
        )
        cursor = cnxn.cursor()
        
        # Consultar las fuentes (medidores) registrados en el motor SQL
        print("[ÉXITO] Conexión establecida. Extrayendo medidores de la tabla Source...")
        cursor.execute("SELECT TOP 10 ID, Name, DisplayName FROM Source")
        rows = cursor.fetchall()
        
        for r in rows:
            print(f" - {r}")
            
        cnxn.close()
        
    except pyodbc.Error as ex:
        sqlstate = ex.args[0]
        print(f"[ERROR SQL] {sqlstate} - {ex}")
    except Exception as e:
        print(f"[ERROR CRÍTICO] {e}")

if __name__ == '__main__':
    test_sql_connection()
