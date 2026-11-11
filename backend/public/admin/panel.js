// Panel de administración de ChanguitApp. Sin frameworks ni build: le pega a /api/admin/*
// (y a /api/pagos/admin/* para marcar liquidaciones) con la clave en el header x-admin-key.
// Todo lo que viene de la API se pone con textContent (nunca innerHTML): los nombres,
// emails y motivos los escriben los usuarios.
'use strict';

const CLAVE_STORAGE = 'changuitapp-admin-key';
const POR_PAGINA = 25;

const ESTADOS_TRABAJO = ['pago_pendiente', 'pendiente', 'asignado', 'en_progreso', 'completado', 'cancelado'];
const ESTADOS_PAGO = ['pendiente', 'aprobado', 'liberado', 'reembolsado', 'reembolsado_parcial', 'reembolso_fallido', 'cancelado', 'monto_invalido'];
const ESTADOS_LIQUIDACION = ['pendiente', 'pagada'];

const COLOR_ESTADO = {
  completado: 'ok', aprobado: 'ok', liberado: 'ok', pagada: 'ok', procesado: 'ok',
  pendiente: 'alerta', pago_pendiente: 'alerta', asignado: 'alerta', en_progreso: 'alerta', recibido: 'alerta',
  cancelado: 'error', reembolso_fallido: 'error', monto_invalido: 'error', error: 'error', rechazado: 'error',
};

const pesos = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });

// ── Utilidades ────────────────────────────────────────────────────────────────

function leerClave() {
  try { return sessionStorage.getItem(CLAVE_STORAGE); } catch { return null; }
}
function guardarClave(clave) {
  try {
    if (clave) sessionStorage.setItem(CLAVE_STORAGE, clave);
    else sessionStorage.removeItem(CLAVE_STORAGE);
  } catch { /* sin storage: la clave vive solo en memoria */ }
}
let clave = leerClave();

// el('td', { className: 'num' }, 'texto', otroNodo)
function el(tag, props = {}, ...hijos) {
  const nodo = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'dataset') Object.assign(nodo.dataset, v);
    else if (k.startsWith('on')) nodo.addEventListener(k.slice(2), v);
    else nodo[k] = v;
  }
  for (const h of hijos.flat()) {
    if (h == null || h === false) continue;
    nodo.append(h instanceof Node ? h : document.createTextNode(String(h)));
  }
  return nodo;
}

const dinero = (n) => (n == null ? '—' : pesos.format(Number(n)));
const fecha  = (iso) => (iso ? new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const chip   = (texto, color) => el('span', { className: `chip ${color ?? COLOR_ESTADO[texto] ?? ''}` }, texto ?? '—');
const corto  = (id) => (id ? String(id).slice(0, 8) : '—');

class ErrorApi extends Error {}

async function api(ruta, { method = 'GET', body } = {}) {
  const respuesta = await fetch(ruta, {
    method,
    headers: { 'x-admin-key': clave ?? '', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const datos = await respuesta.json().catch(() => ({}));
  if (respuesta.status === 403 && ruta.startsWith('/api/admin')) {
    cerrarSesion('La clave no es válida.');
    throw new ErrorApi('No autorizado');
  }
  if (!respuesta.ok) throw new ErrorApi(datos.error ?? `Error ${respuesta.status}`);
  return datos;
}

function avisar(texto, esError = false) {
  const aviso = document.getElementById('aviso');
  aviso.textContent = texto;
  aviso.className = `mensaje${esError ? ' error' : ''}`;
  aviso.hidden = !texto;
}

// ── Estado y navegación ──────────────────────────────────────────────────────

const estado = { vista: 'resumen', pagina: 1, filtros: {} };

function irA(vista) {
  estado.vista = vista;
  estado.pagina = 1;
  estado.filtros = {};
  for (const b of document.querySelectorAll('#pestanas button')) {
    b.setAttribute('aria-selected', String(b.dataset.vista === vista));
  }
  dibujar();
}

async function dibujar() {
  avisar('');
  const contenedor = document.getElementById('vista');
  contenedor.replaceChildren(el('p', { className: 'suave' }, 'Cargando…'));
  try {
    contenedor.replaceChildren(await VISTAS[estado.vista]());
  } catch (error) {
    if (!(error instanceof ErrorApi)) console.error(error);
    contenedor.replaceChildren();
    avisar(error.message, true);
  }
}

function query(extra = {}) {
  const params = new URLSearchParams({ pagina: estado.pagina, porPagina: POR_PAGINA, ...extra });
  for (const [k, v] of Object.entries(estado.filtros)) if (v) params.set(k, v);
  return params.toString();
}

// ── Piezas comunes ───────────────────────────────────────────────────────────

function selectorFiltro(nombre, etiqueta, opciones) {
  return el('label', {}, `${etiqueta} `,
    el('select', {
      value: estado.filtros[nombre] ?? '',
      onchange: (e) => { estado.filtros[nombre] = e.target.value; estado.pagina = 1; dibujar(); },
    },
    el('option', { value: '' }, 'Todos'),
    opciones.map((o) => el('option', { value: o, selected: estado.filtros[nombre] === o }, o))));
}

function tabla(columnas, filas) {
  if (!filas.length) return el('p', { className: 'suave' }, 'No hay resultados.');
  return el('div', { className: 'tabla' },
    el('table', {},
      el('thead', {}, el('tr', {}, columnas.map((c) => el('th', {}, c)))),
      el('tbody', {}, filas)));
}

function paginador(total) {
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const cambiar = (delta) => () => { estado.pagina += delta; dibujar(); };
  return el('div', { className: 'paginas' },
    el('span', { className: 'suave' }, `${total} resultado${total === 1 ? '' : 's'} · página ${estado.pagina} de ${paginas}`),
    el('button', { className: 'accion', type: 'button', disabled: estado.pagina <= 1, onclick: cambiar(-1) }, 'Anterior'),
    el('button', { className: 'accion', type: 'button', disabled: estado.pagina >= paginas, onclick: cambiar(1) }, 'Siguiente'));
}

// Botón que ejecuta una acción contra la API y vuelve a dibujar la vista.
function botonAccion(texto, accion, { peligro = false } = {}) {
  return el('button', {
    className: `accion${peligro ? ' peligro' : ''}`,
    type: 'button',
    onclick: async (e) => {
      const boton = e.currentTarget;  // después del primer await, e.currentTarget es null
      boton.disabled = true;
      try {
        const mensaje = await accion();
        if (mensaje === false) { boton.disabled = false; return; }
        await dibujar();
        if (mensaje) avisar(mensaje);
      } catch (error) {
        boton.disabled = false;
        avisar(error.message, true);
      }
    },
  }, texto);
}

const kpi = (etiqueta, valor) => el('div', { className: 'tarjeta kpi' },
  el('div', { className: 'valor' }, valor), el('div', { className: 'etiqueta' }, etiqueta));

// ── Vistas ───────────────────────────────────────────────────────────────────

const VISTAS = {
  async resumen() {
    const r = await api('/api/admin/resumen');
    const porEstado = (obj) => Object.entries(obj).map(([k, v]) => el('span', {}, chip(k), ` ${v}  `));
    return el('div', {},
      r.pagosSimulados ? el('p', { className: 'mensaje' }, 'Pagos en modo SIMULADO: no se cobra ni se devuelve plata real.') : null,
      el('div', { className: 'kpis' },
        kpi('Usuarios', `${r.usuarios.total}`),
        kpi('Trabajos', `${r.trabajos.total}`),
        kpi('Retenido (cobrado, sin liberar)', dinero(r.pagos.montoRetenido)),
        kpi('Comisiones ganadas', dinero(r.pagos.comisionesGanadas)),
        kpi('Reembolsado', dinero(r.pagos.montoReembolsado)),
        kpi(`Liquidaciones pendientes (${r.liquidaciones.pendientes})`, dinero(r.liquidaciones.montoPendiente)),
        kpi('Reembolsos fallidos', `${r.pagos.reembolsosFallidos}`)),
      el('div', { className: 'tarjeta' },
        el('p', {}, el('strong', {}, 'Usuarios: '), porEstado(r.usuarios.porTipo)),
        el('p', {}, el('strong', {}, 'Trabajos: '), porEstado(r.trabajos.porEstado)),
        el('p', {}, el('strong', {}, 'Pagos: '), porEstado(r.pagos.porEstado))));
  },

  async usuarios() {
    const r = await api(`/api/admin/usuarios?${query()}`);

    const buscador = el('input', {
      type: 'search', placeholder: 'Buscar por email', value: estado.filtros.q ?? '',
      onchange: (e) => { estado.filtros.q = e.target.value.trim(); estado.pagina = 1; dibujar(); },
    });

    const filas = r.usuarios.map((u) => el('tr', {},
      el('td', {}, u.email, el('div', { className: 'suave' }, corto(u.id))),
      el('td', {}, u.tipo),
      el('td', {}, u.perfil ? `${u.perfil.nombre ?? ''} ${u.perfil.apellido ?? ''}` : el('span', { className: 'suave' }, 'sin perfil')),
      el('td', {}, u.perfil?.dni ?? '—'),
      el('td', {}, u.verificado ? chip('verificado', 'ok') : chip('sin verificar', '')),
      el('td', { className: 'largo' }, u.suspendido
        ? [chip('suspendido', 'error'), el('div', { className: 'suave' }, u.suspendidoMotivo ?? '')]
        : chip('activo', 'ok')),
      el('td', {}, el('div', { className: 'acciones' },
        u.verificado
          ? botonAccion('Quitar verificación', async () => {
            await api(`/api/admin/usuarios/${u.id}/verificacion`, { method: 'POST', body: { verificado: false } });
            return `Se quitó la verificación de ${u.email}.`;
          })
          : botonAccion('Verificar', async () => {
            const nota = prompt(`Verificar a ${u.email}. Nota (opcional): qué documentación revisaste`);
            if (nota === null) return false;
            await api(`/api/admin/usuarios/${u.id}/verificacion`, { method: 'POST', body: { verificado: true, nota: nota || null } });
            return `${u.email} quedó verificado.`;
          }),
        u.suspendido
          ? botonAccion('Reactivar', async () => {
            await api(`/api/admin/usuarios/${u.id}/suspension`, { method: 'POST', body: { suspendido: false } });
            return `${u.email} fue reactivado.`;
          })
          : botonAccion('Suspender', async () => {
            const motivo = prompt(`Motivo de la suspensión de ${u.email} (se le muestra al usuario):`);
            if (!motivo) return false;
            await api(`/api/admin/usuarios/${u.id}/suspension`, { method: 'POST', body: { suspendido: true, motivo } });
            return `${u.email} fue suspendido.`;
          }, { peligro: true })))));

    return el('div', {},
      el('div', { className: 'filtros' },
        buscador,
        selectorFiltro('tipo', 'Tipo', ['empleado', 'empleador']),
        selectorFiltro('suspendido', 'Suspendido', ['true', 'false'])),
      el('div', { className: 'tarjeta' },
        tabla(['Email', 'Tipo', 'Nombre', 'DNI', 'Identidad', 'Estado', ''], filas),
        paginador(r.total)));
  },

  async trabajos() {
    const r = await api(`/api/admin/trabajos?${query()}`);
    const filas = r.trabajos.map((t) => el('tr', {},
      el('td', { className: 'largo' }, t.titulo, el('div', { className: 'suave' }, `${t.categoria} · ${corto(t.id)}`)),
      el('td', {}, chip(t.estado),
        t.cancelado_por ? el('div', { className: 'suave' }, `por ${t.cancelado_por}`) : null),
      el('td', {}, t.empleador ?? '—'),
      el('td', {}, t.trabajador ?? '—'),
      el('td', { className: 'num' }, dinero(t.precio)),
      el('td', { className: 'num' }, dinero(t.comision_monto)),
      el('td', { className: 'num' }, dinero(t.monto_trabajador)),
      el('td', {}, fecha(t.creado_en))));
    return el('div', {},
      el('div', { className: 'filtros' }, selectorFiltro('estado', 'Estado', ESTADOS_TRABAJO)),
      el('div', { className: 'tarjeta' },
        tabla(['Trabajo', 'Estado', 'Empleador', 'Trabajador', 'Precio', 'Comisión', 'Al trabajador', 'Creado'], filas),
        paginador(r.total)));
  },

  async pagos() {
    const r = await api(`/api/admin/transacciones?${query({ tipo: 'pagos' })}`);
    const filas = r.transacciones.map((p) => el('tr', {},
      el('td', { className: 'largo' }, p.titulo ?? corto(p.trabajo_id), el('div', { className: 'suave' }, p.persona ?? '')),
      el('td', {}, chip(p.estado),
        p.ultimo_error ? el('div', { className: 'suave' }, p.ultimo_error) : null),
      el('td', { className: 'num' }, dinero(p.monto)),
      el('td', { className: 'num' }, p.comisionMonto == null ? '—' : `${dinero(p.comisionMonto)} (${p.comisionPorcentaje}%)`),
      el('td', { className: 'num' }, dinero(p.monto_reembolsado)),
      el('td', {}, p.mp_payment_id ?? '—'),
      el('td', {}, fecha(p.aprobado_en ?? p.creado_en ?? p.actualizado_en))));
    return el('div', {},
      el('div', { className: 'filtros' }, selectorFiltro('estado', 'Estado', ESTADOS_PAGO)),
      el('div', { className: 'tarjeta' },
        tabla(['Trabajo / empleador', 'Estado', 'Cobrado', 'Comisión', 'Reembolsado', 'Pago MP', 'Fecha'], filas),
        paginador(r.total)));
  },

  async liquidaciones() {
    const r = await api(`/api/admin/transacciones?${query({ tipo: 'liquidaciones' })}`);
    const filas = r.transacciones.map((l) => el('tr', {},
      el('td', { className: 'largo' }, l.titulo ?? corto(l.trabajo_id), el('div', { className: 'suave' }, l.persona ?? '')),
      el('td', {}, l.motivo),
      el('td', {}, chip(l.estado), l.referencia ? el('div', { className: 'suave' }, `ref. ${l.referencia}`) : null),
      el('td', { className: 'num' }, dinero(l.monto)),
      el('td', {}, l.alias_cobro ?? chip('sin alias/CBU', 'error')),
      el('td', {}, fecha(l.creado_en)),
      el('td', {}, l.estado === 'pendiente'
        ? botonAccion('Marcar pagada', async () => {
          const referencia = prompt(`Transferiste ${dinero(l.monto)} a ${l.alias_cobro ?? '(sin alias)'}. Número de operación:`);
          if (!referencia) return false;
          await api(`/api/pagos/admin/liquidaciones/${l.id}/pagar`, { method: 'POST', body: { referencia } });
          return 'Liquidación marcada como pagada.';
        })
        : fecha(l.pagada_en))));
    return el('div', {},
      el('div', { className: 'filtros' }, selectorFiltro('estado', 'Estado', ESTADOS_LIQUIDACION)),
      el('div', { className: 'tarjeta' },
        tabla(['Trabajo / trabajador', 'Motivo', 'Estado', 'Monto', 'Alias / CBU', 'Creada', ''], filas),
        paginador(r.total)));
  },
};

// ── Sesión ───────────────────────────────────────────────────────────────────

function mostrarPanel() {
  document.getElementById('pantalla-login').hidden = true;
  document.getElementById('pantalla-panel').hidden = false;
  irA('resumen');
}

function cerrarSesion(mensaje) {
  clave = null;
  guardarClave(null);
  document.getElementById('pantalla-panel').hidden = true;
  document.getElementById('pantalla-login').hidden = false;
  const error = document.getElementById('error-login');
  error.textContent = mensaje ?? '';
  error.hidden = !mensaje;
}

document.getElementById('form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  clave = document.getElementById('clave').value;
  try {
    await api('/api/admin/resumen');
    guardarClave(clave);
    document.getElementById('clave').value = '';
    mostrarPanel();
  } catch (error) {
    cerrarSesion(error.message === 'No autorizado' ? 'La clave no es válida.' : error.message);
  }
});

document.getElementById('salir').addEventListener('click', () => cerrarSesion());
for (const b of document.querySelectorAll('#pestanas button')) {
  b.addEventListener('click', () => irA(b.dataset.vista));
}

if (clave) mostrarPanel();
