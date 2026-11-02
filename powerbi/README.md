# Datos para Power BI

Datos **sintéticos** del prototipo Smart-Tourism (no capturados desde Wokwi ni mediciones reales de las Cuevas de Taulabé).

- `data/eventos_iot.csv`: eventos de entrada, salida y rechazos.
- `data/ocupacion.csv`: aforo después de cada evento.
- `data/alertas.csv`: alertas y eventos que requieren revisión.
- `data/resumen_diario.csv`: indicadores diarios.
- `scripts/generar_datos.py`: generador reproducible.

**Importación:** Power BI Desktop → Obtener datos → Texto/CSV; delimitador `;`, codificación UTF-8. Convertir `fecha` a Fecha y `fecha_hora` a Fecha/Hora. Los archivos tienen 21 días simulados de octubre de 2026, capacidad de 10 y semilla fija 5042026.

Para regenerar: `python powerbi/scripts/generar_datos.py` desde la raíz del repositorio. El generador no requiere bibliotecas externas.
