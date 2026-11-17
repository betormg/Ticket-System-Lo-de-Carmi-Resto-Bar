# Caja Lo de Carmi: sistema de pedidos (frontend)

## Qué es
Web de caja para **Lo de Carmi Resto Bar** (comida casera, Bruselas, Asunción, Paraguay).
Se usa en el local, desde una compu o un celular, para tomar pedidos, cobrar
y ver las ventas del día. Todo es digital: no hay impresora. La base de datos ya está hecha y probada en Supabase:
este proyecto es solo el frontend.

Dueño: Roberto. Es estudiante de desarrollo web, así que explicá brevemente
las decisiones técnicas que tomes, para que pueda aprender del código.

## Stack
- HTML + CSS + JavaScript (sin framework), con **Vite** como servidor de desarrollo y build.
- `@supabase/supabase-js` v2 para hablar con la base.
- Deploy en **Vercel** (más adelante).
- Diseño mobile-first, botones grandes (se usa con el dedo, apurado, en hora pico).
- Moneda: guaraníes (Gs), enteros, formato `25.000 Gs`. Zona horaria: America/Asuncion.

## Conexión a Supabase
```
SUPABASE_URL=https://fusejrgrkekndusqnfzn.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_SxOdrlA2JFHGFRaEdsMhug_FRoMbRSS
```
Guardalas en `.env` como `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`, y agregá `.env` a `.gitignore`.
La clave publishable es pública por diseño. **Nunca** uses ni pidas la `service_role` / secret key en el frontend.

## Autenticación
La base **solo acepta usuarios logueados**: todas las tablas tienen RLS con la política
"authenticated puede todo", y las funciones rechazan llamadas sin sesión.
- Pantalla de login con email y contraseña (`supabase.auth.signInWithPassword`).
- No hay registro desde la web. El usuario del local lo crea Roberto en el panel de Supabase (Authentication).
- La sesión tiene que persistir: no hay que loguearse cada vez que se abre la caja.

## Base de datos (ya existe, NO modificar el esquema sin preguntar)

### Tablas
- `menu_items`: id (uuid), name, category, price (int, Gs), active (bool), created_at
- `daily_stock`: stock_date (date), item_id → menu_items, qty_initial, qty_sold. PK (stock_date, item_id)
- `orders`: id, order_date, ticket_no (se reinicia cada día, único por día), status, channel,
  customer_name, customer_phone, payment_method, notes, total, created_at
  - status: `pendiente` | `en_cocina` | `listo` | `entregado` | `anulado`
  - channel: `local` | `delivery` | `vianda`
  - payment_method: `efectivo` | `transferencia` | `tarjeta` | `pendiente`
- `order_items`: id, order_id → orders, item_id → menu_items, qty, unit_price

### Funciones (llamar con `supabase.rpc`)
- `create_order(p_channel, p_customer_name, p_customer_phone, p_payment, p_notes, p_items)`
  - `p_items` = `[{ "item_id": "<uuid>", "qty": 2 }, ...]`
  - Asigna el número de ticket, toma el precio de la base (no del frontend), descuenta stock
    y devuelve la fila de `orders`.
  - Errores posibles: `Sin stock suficiente`, `Plato inexistente o inactivo`, `No autorizado`.
    Mostralos en lenguaje claro.
  - Un plato **sin fila de stock para hoy no se puede vender**: la función lo rechaza por falta de stock.
- `cancel_order(p_order_id)`: marca el pedido como anulado y devuelve el stock.
- `set_daily_stock(p_items, p_date)`: `p_items` = `[{ "item_id": "<uuid>", "qty": 20 }]`. Si no se pasa `p_date`, usa hoy.
  Crea o actualiza las porciones iniciales del día.

### Vistas (solo lectura)
- `v_stock_hoy`: plato, categoria, precio, inicial, vendido, disponible
- `v_ventas_por_dia`: fecha, pedidos, total_vendido, efectivo, transferencia, tarjeta, pendiente_cobro
- `v_ventas_por_plato`: fecha, plato, categoria, unidades, recaudado

Ojo: `v_stock_hoy` no trae `item_id`. Para armar la grilla de la caja, leé `daily_stock` de hoy
con join a `menu_items` (por ejemplo `.from('daily_stock').select('*, menu_items(*)')`).

## Pantallas (en orden de prioridad)
1. **Login**
2. **Caja** (pantalla principal)
   - Grilla de platos activos agrupados por categoría, con precio y disponible de hoy.
     Los platos agotados aparecen deshabilitados.
   - Carrito con + / − por plato y total en vivo.
   - Canal (local / delivery / vianda), nombre y teléfono opcionales, forma de pago y nota.
   - Botón "Confirmar pedido": llama a `create_order` y muestra el ticket digital.
3. **Ticket digital** (Roberto prefiere todo digital, sin impresora): al confirmar, mostrar en pantalla
   el ticket con número, fecha y hora, detalle, total, forma de pago y canal. Si el pedido tiene teléfono
   de cliente, botón para compartirlo por WhatsApp (`https://wa.me/<telefono>?text=<resumen>`).
   No implementar impresión.
4. **Pedidos de hoy**: lista con estado. Botones para avanzar estado
   (pendiente → en_cocina → listo → entregado) y para anular (con confirmación, usa `cancel_order`).
5. **Stock del día**: cargar las porciones de cada plato a la mañana (usa `set_daily_stock`).
6. **Reportes**: ventas del día por forma de pago y ranking de platos, con selector de fecha.
7. **Menú**: alta, edición y activar/desactivar platos (no borrar: hay pedidos que los referencian).
   **Roberto va a cargar su menú real él mismo desde esta pantalla** (no se carga por SQL), así que
   hacela junto con Stock, antes de Pedidos de hoy y Reportes. Los 3 platos que hay hoy
   (milanesa, guiso, gaseosa) y el pedido "Prueba" del 11/11 son datos de prueba.

## Fuera de alcance por ahora
- Combos prepagos (clientes que pagan X comidas por adelantado con descuento). Necesitan cambios
  en la base; se hacen después.
- Facturación legal / SIFEN.
- Impresión de tickets o impresoras térmicas.

## Cómo trabajar
- Arrancá por login + menú + stock + caja + ticket digital, que es lo mínimo para usarlo en el local. Después seguí con el resto.
- Antes de cambios grandes, mostrá un plan corto.
- Probá cada pantalla contra la base real. Los pedidos de prueba se pueden anular con `cancel_order`.
