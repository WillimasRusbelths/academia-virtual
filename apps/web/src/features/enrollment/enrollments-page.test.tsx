import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect,test } from 'vitest';
import { enrollment,enrollmentsPage } from './payment-test-contract';

function markup(status:string,extra:Readonly<Record<string,unknown>>={}){return renderToStaticMarkup(createElement(enrollmentsPage(),{state:{status,enrollments:{items:[enrollment],total:1,page:1,pageSize:20},...extra}}));}
test('WM00 control: antecedente ficticio conserva fecha UTC y período Lima',()=>{expect(enrollment.validUntil).toBe('2090-04-01T05:00:00.000000Z');expect(enrollment.timeZone).toBe('America/Lima');});
test('WM01 lista muestra curso/grupo y período/franjas originales',()=>{const html=markup('READY');expect(html).toContain(enrollment.courseName);expect(html).toContain(enrollment.groupName);expect(html).toContain(enrollment.periodStart);expect(html).toContain(enrollment.periodEnd);expect(html).toContain(enrollment.validUntil);expect(html).toContain('America/Lima');expect(html).toMatch(/18:00.*19:00/);});
test('WM02 oferta retirada no elimina matrícula ni cambia su vigencia',()=>{const html=markup('READY',{offeringUnavailable:true});expect(html).toContain(enrollment.courseName);expect(html).toContain(enrollment.validUntil);expect(html).not.toMatch(/matr[ií]cula cancelada/i);});
for(const status of ['LOADING','EMPTY','ERROR','UNCERTAIN','AUTH_REQUIRED','FORBIDDEN'])test('WM03 '+status+' accesible y sin detalle privado residual',()=>{const html=markup(status);expect(html).toMatch(/role="(?:status|alert)"|aria-live=/);expect(html).not.toContain(enrollment.courseName);});
test('WM04 sin matrícula en vacío o conciliación; sin aprobación o traslado manual',()=>{for(const status of ['EMPTY','INCIDENT']){const html=markup(status,{enrollments:{items:[],total:0,page:1,pageSize:20}});expect(html).not.toContain(enrollment.courseName);expect(html).not.toMatch(/Aprobar pago|Confirmar matr[ií]cula|Trasladar|Devolver/);}});
test('WM05 DTO no muestra claves, recibos ni evidencia técnica',()=>{const html=markup('READY',{providerPaymentId:'PRIVATE_FIXTURE',receiptId:'PRIVATE_FIXTURE',externalIdempotencyKey:'PRIVATE_FIXTURE'});expect(html).not.toMatch(/PRIVATE_FIXTURE|providerPaymentId|receiptId|externalIdempotencyKey/);});
