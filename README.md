# Caja Lo de Carmi

Sistema de pedidos para **Lo de Carmi Resto Bar** (comida casera, Asunción, Paraguay).
Se usa desde una computadora o un celular para tomar pedidos, controlar las porciones
del día y ver las ventas. Es todo digital: no usa impresora.

La web pública del local, que lee el menú del día desde la misma base, está en otro
repositorio: [lo-de-carmi-landing](https://github.com/betormg/lo-de-carmi-landing).

## Qué hace

| Pantalla | Para qué sirve |
|---|---|
| **Login** | Solo entra el personal. No hay registro desde la web. |
| **Caja** | Platos disponibles hoy, carrito, canal (local, delivery o vianda), forma de pago y ticket digital para compartir por WhatsApp. |
| **Menú** | Alta y edición de platos, guarniciones, bebidas y postres. No se borran: se desactivan. |
| **Stock** | Porciones de cada plato y guarniciones disponibles hoy. |
| **Pedidos** | Pedidos del día, avance de estado y anulación con devolución de stock. |
| **Reportes** | Ventas por forma de pago y ranking de platos por fecha. |

## Tecnologías

- HTML, CSS y JavaScript sin framework
- [Vite](https://vite.dev/) como servidor de desarrollo y build
- [Supabase](https://supabase.com/) (PostgreSQL y autenticación) con `@supabase/supabase-js`
- Vercel para publicar

## La base de datos

El esquema completo está en [`supabase/schema.sql`](supabase/schema.sql).

```
menu_items ──< daily_stock          porciones de cada ítem por día
    │
    └──────< order_items >── orders
combos                              viandas prepagas (precio por cantidad)
```

Decisiones principales:

- **La lógica sensible vive en la base.** `create_order` numera el ticket, toma el precio
  de la tabla (no del navegador) y descuenta stock en una sola transacción.
- **No se puede sobrevender.** Una restricción impide que lo vendido supere lo cargado.
- **Row Level Security en todas las tablas.** Un visitante sin sesión no puede leer
  pedidos, stock ni ventas. Para el menú público existe una única función,
  `web_menu_hoy()`, que devuelve solo lo que muestra la web.
- **Las vistas de reportes usan `security_invoker`**, así respetan los mismos permisos.

## Cómo correrlo

1. Crear un proyecto en Supabase y ejecutar `supabase/schema.sql` en el SQL Editor.
2. En Authentication, **desactivar el registro de usuarios nuevos** y crear el usuario
   del local. Es obligatorio: cualquier usuario autenticado tiene acceso completo.
3. Copiar `.env.example` a `.env` y completar la URL y la clave **publishable**.
   Nunca usar la `service_role` o secret key en el frontend.
4. Instalar y levantar:

```bash
npm install
```

```bash
npm run dev
```

Para publicar en Vercel, importar el repositorio y cargar las dos variables
`VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` antes del primer despliegue.

## Limitaciones conocidas

- La Caja no registra qué guarnición eligió el cliente ni cobra su recargo.
- Los combos prepagos todavía no se venden desde la Caja.
- No emite facturas legales.
- No tiene tests automáticos.

## Autor

Roberto Mendoza · [github.com/betormg](https://github.com/betormg)
