# Fragancia y Miel

Aplicación React para administrar materias primas, insumos indirectos, utensilios, recetas, costos y lotes de producción de la jabonería artesanal Fragancia y Miel. El ingreso solicita el código `8863` y crea una sesión anónima de Supabase para guardar los datos.

## Requisitos

- Node.js 20.19+ o 22.12+
- Proyecto Supabase

## Inicio

1. Instala dependencias con `npm install`.
2. Copia `.env.example` a `.env` y configura `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
3. En Supabase, abre **SQL Editor**, ejecuta el contenido de [`supabase/schema.sql`](./supabase/schema.sql) y confirma que terminó sin errores. Vuelve a ejecutar el esquema actualizado cuando incorpores cambios de base de datos. Si aparece `Could not find the function public.record_purchase(...) in the schema cache`, ejecuta de nuevo el esquema completo para instalar la función compatible y recargar la caché de Supabase.
4. En Supabase, habilita **Anonymous Sign-Ins** en la configuración de proveedores de autenticación.
5. Inicia el servidor de desarrollo con `npm run dev`.

El `.env` incluido en este espacio ya tiene la URL y la clave publicable proporcionadas. No agregues claves `service_role` al frontend ni publiques el archivo `.env`.

## Despliegue en GitHub Pages

En **Settings → Pages → Build and deployment**, selecciona **GitHub Actions** como fuente. El flujo de GitHub Actions compila la aplicación y publica el contenido de `dist` al hacer push a `main`. En **Settings → Secrets and variables → Actions**, configura la variable `NEXT_PUBLIC_SUPABASE_URL` y el secreto `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. La clave publicable se incorpora al frontend y no debe confundirse con una clave `service_role`.

## Funciones

- Aplicación web progresiva (PWA): instalable desde navegadores compatibles, con shell y recursos estáticos disponibles sin conexión. La información de negocio se sincroniza con Supabase y requiere conexión; la última vista se conserva en este navegador al recargar.
- Navegación organizada por áreas, adaptable a escritorio y móvil; incluye vistas para recetas, ventas, recordatorios de cobro y reportes financieros.
- Inventario de materias primas con alertas, existencias y costo unitario configurable por gramo, mililitro o pieza.
- Control de insumos indirectos con unidad física (g/ml/pza), existencias, mínimo de reabastecimiento, consumo por jabón, rendimiento estimado y costo unitario; producción descuenta su consumo real. Control de depreciación de utensilios.
- Creación de recetas con varias materias primas, insumos indirectos y utensilios; las cantidades de materia prima se ingresan por jabón, se multiplican por el tamaño del lote y se muestra el costo por barra.
- Precios editables al detalle, por mayor y para eventos; calcula ganancia por barra y margen bruto (`(precio - costo) / precio`).
- Registro transaccional de producción: verifica existencias y descuenta materias primas.
- Vista **Stock de jabones** con existencias disponibles por nombre de producto web, detalle de lote y total sin duplicar lotes compartidos.
- Al eliminar un lote, los productos web quedan sin lote, se cancelan los pedidos activos relacionados y se conserva el historial de pedidos.
- Ventas en borrador y comprobantes internos numerados; al emitirlos valida las existencias de jabones terminados (producción menos ventas), registra la venta y permite imprimir o reimprimir la factura.
- Registro de compras por materia prima, insumo indirecto o utensilio, con proveedor, costo unitario y forma de pago; las compras acumulan stock/costo y rendimiento o vida útil según el tipo.
- Catálogo público independiente en `storefront.html`, con tarjetas interactivas, carrito de compras modal, disponibilidad por lote, beneficios, composición y modo de uso.
- Pedidos web: las órdenes pendientes no descuentan existencias; al reservarlas, el sistema valida y aparta unidades de forma atómica. Las pestañas separan pedidos, reservas, ventas y rechazados; entregar un pedido reservado lo convierte en una venta facturada. El contador y las notificaciones incluyen solo pedidos sin reservar.
- Pedidos a crear: registra pedidos personalizados con nombre y celular del cliente, diseño, fragancia, color y cantidad; organízalos por estado pendiente, creado o rechazado.
- Configuración de nombre, logo, contacto, WhatsApp y presentación del negocio desde el panel. Las imágenes se guardan en el bucket público `jabon`; solo usuarios autenticados pueden subirlas o editarlas.
- Administración de productos web vinculados a un lote producido, con beneficios, afecciones asociadas, composición y modo de uso. La tienda solo publica productos activos con precio definido y muestra existencias actualizadas.
- Cobros pendientes es una lista independiente de recordatorios manuales y no está conectada a ventas. Finanzas incluye ingresos adicionales por concepto, reflejados en el estado de resultados y el balance general de gestión.
- Exportación de los datos visibles a JSON.
- Acceso a la interfaz mediante un código y sesión anónima de Supabase; las sesiones anónimas comparten el inventario.

**Importante:** `8863` se valida en React y puede encontrarse inspeccionando los archivos del frontend; es una pantalla de acceso, no una autenticación segura. Todas las sesiones anónimas comparten el mismo inventario y pueden consultar, crear, editar o eliminar sus registros. Por tanto, cualquier persona que pueda abrir la aplicación puede acceder a esos datos; para restringir el acceso, configura autenticación real en Supabase y políticas RLS por usuario. Nunca pongas una clave secreta o `service_role` en React.

Los comprobantes de venta y los reportes financieros son internos/de gestión; no tienen validez fiscal ni representan estados auditados. Configura los saldos iniciales en **Finanzas** para reflejar caja, cuentas por cobrar/pagar y capital a la fecha de apertura. El balance muestra inventario, efectivo, cuentas por cobrar, cuentas por pagar y patrimonio; no contempla préstamos, impuestos ni activos fijos como cuentas separadas. Al comprar insumos indirectos, la cantidad representa unidades de rendimiento agregadas; al comprar utensilios, representa usos de vida útil agregados. Si ya habías ejecutado una versión anterior de `supabase/schema.sql`, vuelve a ejecutar el archivo actualizado para habilitar varias selecciones por receta, guardar el costo unitario de materias primas y actualizar el registro de compras.

Al registrar una compra, ingresa el costo de una unidad por artículo; el sistema calcula cada importe como cantidad × costo unitario y actualiza el costo promedio ponderado de los inventarios. El inventario de materia prima muestra el costo total de las existencias adquiridas (costo unitario × stock inicial y compras); el buscador filtra por código, nombre o unidad y ordena por stock actual de mayor a menor. Los insumos indirectos tienen su unidad física y consumo por jabón; el rendimiento estimado se calcula como stock disponible ÷ consumo por jabón. Las recetas y la producción usan ese consumo para calcular costos y descontar existencias. Al volver a ejecutar `supabase/schema.sql`, los insumos indirectos existentes se migran temporalmente como piezas con consumo de una pieza por jabón; revisa y ajusta su unidad, existencias y consumo por jabón en el formulario de cada insumo. Al registrar o editar una materia prima, ingresa su costo por unidad de medida (LPS/g, LPS/ml o LPS/pza). En las recetas, ingresa las cantidades de ingredientes necesarias para un jabón: el costo total del lote multiplica ese consumo por la cantidad de jabones y la producción descuenta del inventario el consumo por jabón multiplicado por los jabones fabricados.

## Tienda pública y pedidos web

1. Vuelve a ejecutar el esquema actualizado `supabase/schema.sql` desde **Supabase → SQL Editor**. Esto crea las tablas de pedidos manuales, vistas de catálogo y pedidos, los procedimientos de reserva/venta y el bucket público `jabon`.
2. En la aplicación, abre **Configuración web** y guarda la identidad y los datos de contacto. Para WhatsApp, usa el número internacional con código de país (por ejemplo, `504...`).
3. En **Productos web**, crea cada producto y, si ya está disponible, asígnale un lote de producción. Puedes guardar productos sin lote y asignarlo más adelante; solo se mostrarán en la tienda cuando tengan lote y precio. Completa beneficios, afecciones que ayuda a tratar (separadas por comas), composición con unidades y modo de uso; sube una imagen JPG, PNG o WebP de hasta 8 MB. En la tienda, el botón flotante permite filtrar productos por una o varias afecciones.
4. Publica el archivo [`src/public/storefront.html`](./src/public/storefront.html) junto a la aplicación. En ese HTML reemplaza `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY` con la URL del proyecto y su clave **publicable**. Nunca pegues una clave `service_role` o secreta; la tienda necesita únicamente la RPC pública de catálogo y envío de pedidos.
5. El despliegue existente de GitHub Pages incluye la tienda en `storefront.html`. Desde **Pedidos web**, reserva, cancela o completa cada pedido. Solo los pedidos reservados afectan el stock; los pendientes no descuentan existencias. Al completar, el sistema crea la venta y factura con los datos del pedido.

La clave publicable forma parte del HTML descargable y no es una credencial secreta. La seguridad de los datos depende de las políticas y RPC del esquema: el catálogo solo expone productos activos y datos de tienda; los pedidos se reciben mediante una función validada y el navegador no obtiene acceso directo anónimo a pedidos, ventas o inventario. No uses un bucket de imágenes para guardar información privada.
