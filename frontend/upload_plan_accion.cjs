const fs = require('fs');
const xlsx = require('xlsx');

const URL_SUPABASE = "https://zuouxnvcktjhqzlniion.supabase.co";
const KEY_SUPABASE = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1b3V4bnZja3RqaHF6bG5paW9uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwOTE2MTEsImV4cCI6MjA4OTY2NzYxMX0.DxgJzjJjkg7zGdg6c4IFX8oJg0QVs1Fw391KIhqxz84";

async function uploadData() {
    try {
        console.log("Leyendo Excel...");
        const wb = xlsx.readFile('E:/Descargas 2/estandarizacion/tabla_plan_accion.xlsx');
        const ws = wb.Sheets[wb.SheetNames[0]];
        // defval: null asegura que todas las claves se inserten incluso si la celda está vacía
        const data = xlsx.utils.sheet_to_json(ws, {defval: null});
        
        console.log(`Leídas ${data.length} filas del Excel.`);
        
        // Convert empty strings to null and ensure strings
        const cleanData = data.map(row => {
            const cleanRow = {};
            for (const key in row) {
                const val = row[key];
                cleanRow[key] = (val === '' || val === null) ? null : String(val);
            }
            return cleanRow;
        });

        const res = await fetch(`${URL_SUPABASE}/rest/v1/auditoria_plan_accion_maestro`, {
            method: 'POST',
            headers: {
                'apikey': KEY_SUPABASE,
                'Authorization': `Bearer ${KEY_SUPABASE}`,
                'Content-Type': 'application/json',
                'Accept-Profile': 'energia',
                'Content-Profile': 'energia',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify(cleanData)
        });

        if (!res.ok) {
            const errTxt = await res.text();
            throw new Error(`Error: ${res.status} ${errTxt}`);
        }
        console.log(`Subido con éxito!`);
    } catch (e) {
        console.error("Error:", e.message);
    }
}

uploadData();
