"""
Script para extraer la jerarquía real guardada en el dump de PME.
"""

import os
import json
import re

def extraer_arbol_desde_dump():
    dump_path = os.path.join(os.path.dirname(__file__), 'dump_pme_real.json')
    if not os.path.exists(dump_path):
        print("El archivo dump_pme_real.json no existe.")
        return

    with open(dump_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    # El arbol de tendencias
    html_tree = data.get("https://10.30.4.124/Web/Trends/GetTrendLibraryTree", "")
    
    # Extraer todo el texto que parezca un nombre de sede o medidor
    # Buscamos patrones típicos de nombres, por ejemplo dentro de etiquetas span, div, o JSON incrustado.
    matches = re.findall(r'([A-Za-z0-9\s\-_]+ - [A-Za-z0-9\s\-_]+)', html_tree)
    
    sedes = set()
    for m in matches:
        if len(m) > 5 and len(m) < 60:
            sedes.add(m.strip())
            
    print(f"Posibles medidores encontrados por Regex ({len(sedes)}):")
    for s in sorted(sedes):
        print("  -", s)
        
    print("\n--- Extrayendo del HTML (Texto limpio) ---")
    from html.parser import HTMLParser
    class MyHTMLParser(HTMLParser):
        def __init__(self):
            super().__init__()
            self.textos = []
        def handle_data(self, data):
            t = data.strip()
            if len(t) > 2 and t not in self.textos:
                self.textos.append(t)

    parser = MyHTMLParser()
    parser.feed(html_tree)
    
    print(f"Textos encontrados ({len(parser.textos)}):")
    for t in parser.textos:
        if "{" not in t and "<" not in t:
            print("  |", t)

if __name__ == '__main__':
    extraer_arbol_desde_dump()
