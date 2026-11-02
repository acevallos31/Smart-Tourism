#!/usr/bin/env python3
"""Datos sinteticos reproducibles para Smart-Tourism (no capturados de Wokwi)."""
import csv
import random
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path

SEED = 5042026
CAPACIDAD = 10
DIAS = 21
INICIO = datetime(2026, 10, 1, 8, 0, 0)
SALIDA = Path(__file__).resolve().parents[1] / 'data'
SALIDA.mkdir(parents=True, exist_ok=True)
rng = random.Random(SEED)
eventos, ocupaciones, alertas = [], [], []
resumen = defaultdict(lambda: dict(entradas=0, salidas=0, rechazados=0, revisar=0, maximo=0, suma=0, mediciones=0, advertencias=0, aforo_maximo=0))
secuencia = 0

def guardar(nombre, campos, filas):
    with (SALIDA / nombre).open('w', encoding='utf-8-sig', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=campos, delimiter=';')
        writer.writeheader()
        writer.writerows(filas)

for d in range(DIAS):
    dia = INICIO + timedelta(days=d)
    ocupacion = 0
    tiempo = dia
    for intento in range(rng.randint(80, 112)):
        tiempo += timedelta(seconds=rng.randint(140, 380))
        if tiempo.hour >= 17:
            break
        secuencia += 1
        fecha = tiempo.strftime('%Y-%m-%d')
        timestamp = tiempo.strftime('%Y-%m-%d %H:%M:%S')
        tipo = rng.choices(['entrada', 'salida', 'indeterminada'], [57, 39, 4])[0]
        if tipo == 'entrada':
            motivo = 'A_B'
            aceptado = ocupacion < CAPACIDAD
            if aceptado:
                ocupacion += 1
            else:
                motivo = 'AFORO_MAXIMO'
        elif tipo == 'salida':
            motivo = 'B_A'
            aceptado = ocupacion > 0
            if aceptado:
                ocupacion -= 1
            else:
                motivo = 'AFORO_CERO'
        else:
            motivo = rng.choice(['PASO_INCOMPLETO', 'SIMULTANEOS'])
            aceptado = False
        validacion = 'REVISAR_DATOS' if tipo == 'indeterminada' else ('ACEPTADO' if aceptado else 'RECHAZADO')
        alerta = 'CAPACIDAD_MAXIMA' if ocupacion == CAPACIDAD else ('ADVERTENCIA_80' if ocupacion >= 8 else 'NINGUNA')
        evento_id = f'ACCESO-01-{secuencia:06d}'
        eventos.append(dict(eventId=evento_id, deviceId='ACCESO-01', sequence=secuencia, fecha_hora=timestamp, fecha=fecha, direction=tipo, validation=validacion, reason=motivo, occupancy=ocupacion, capacity=CAPACIDAD, alert=alerta, origen='SIMULADO'))
        ocupaciones.append(dict(eventId=evento_id, fecha_hora=timestamp, fecha=fecha, ocupacion=ocupacion, capacidad=CAPACIDAD, porcentaje_ocupacion=ocupacion * 100 // CAPACIDAD, estado='MAXIMO' if ocupacion == CAPACIDAD else ('ADVERTENCIA' if ocupacion >= 8 else 'NORMAL')))
        r = resumen[fecha]
        if validacion == 'ACEPTADO':
            r['entradas' if tipo == 'entrada' else 'salidas'] += 1
        elif validacion == 'RECHAZADO':
            r['rechazados'] += 1
        else:
            r['revisar'] += 1
        r['maximo'] = max(r['maximo'], ocupacion)
        r['suma'] += ocupacion
        r['mediciones'] += 1
        if alerta != 'NINGUNA' or validacion != 'ACEPTADO':
            tipo_alerta = 'REVISAR_DATOS' if validacion == 'REVISAR_DATOS' else ('EVENTO_RECHAZADO' if validacion == 'RECHAZADO' else alerta)
            alertas.append(dict(eventId=evento_id, fecha_hora=timestamp, fecha=fecha, tipo_alerta=tipo_alerta, ocupacion=ocupacion, capacidad=CAPACIDAD, detalle=motivo, origen='SIMULADO'))
            if alerta == 'ADVERTENCIA_80': r['advertencias'] += 1
            if alerta == 'CAPACIDAD_MAXIMA': r['aforo_maximo'] += 1

resumen_filas = [dict(fecha=fecha, entradas=r['entradas'], salidas=r['salidas'], eventos_rechazados=r['rechazados'], eventos_revisar=r['revisar'], ocupacion_maxima=r['maximo'], ocupacion_promedio=round(r['suma']/r['mediciones'], 2), capacidad=CAPACIDAD, eventos_advertencia=r['advertencias'], eventos_capacidad_maxima=r['aforo_maximo'], total_eventos=r['mediciones']) for fecha, r in sorted(resumen.items())]
guardar('eventos_iot.csv', ['eventId','deviceId','sequence','fecha_hora','fecha','direction','validation','reason','occupancy','capacity','alert','origen'], eventos)
guardar('ocupacion.csv', ['eventId','fecha_hora','fecha','ocupacion','capacidad','porcentaje_ocupacion','estado'], ocupaciones)
guardar('alertas.csv', ['eventId','fecha_hora','fecha','tipo_alerta','ocupacion','capacidad','detalle','origen'], alertas)
guardar('resumen_diario.csv', ['fecha','entradas','salidas','eventos_rechazados','eventos_revisar','ocupacion_maxima','ocupacion_promedio','capacidad','eventos_advertencia','eventos_capacidad_maxima','total_eventos'], resumen_filas)
print(f'Dias: {len(resumen_filas)} | Eventos: {len(eventos)} | Alertas: {len(alertas)}')
