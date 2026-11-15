# Fragancia y Miel

Aplicación React para administrar materias primas, insumos indirectos, utensilios, recetas, costos y lotes de producción de la jabonería artesanal Fragancia y Miel. El ingreso solicita el código `8863` y crea una sesión anónima de Supabase para guardar los datos.

## Requisitos

- Node.js 20.19+ o 22.12+
- Proyecto Supabase

## Inicio

1. Instala dependencias con `npm install`.
2. Copia `.env.example` a `.env` y configura `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
3. En Supabase, abre **SQL Editor**, ejecuta el contenido de [`supabase/schema.sql`](./supabase/schema.sql) y confirma que terminó sin errores.
4. En Supabase, habilita **Anonymous Sign-Ins** en la configuración de proveedores de autenticación.
5. Inicia el servidor de desarrollo con `npm run dev`.

El `.env` incluido en este espacio ya tiene la URL y la clave publicable proporcionadas. No agregues claves `service_role` al frontend ni publiques el archivo `.env`.

## Despliegue en GitHub Pages

En **Settings → Pages → Build and deployment**, selecciona **GitHub Actions** como fuente. El flujo de GitHub Actions compila la aplicación y publica el contenido de `dist` al hacer push a `main`. En **Settings → Secrets and variables → Actions**, configura la variable `NEXT_PUBLIC_SUPABASE_URL` y el secreto `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. La clave publicable se incorpora al frontend y no debe confundirse con una clave `service_role`.

## Funciones

- Navegación lateral adaptable a escritorio y móvil; incluye vistas separadas para crear recetas, consultar recetas guardadas y facturar/consultar ventas.
- Inventario de materias primas con alertas, existencias y costo unitario configurable por gramo, mililitro o pieza.
- Control de insumos indirectos y depreciación de utensilios.
- Creación de recetas con varias materias primas, insumos indirectos y utensilios; las cantidades de materia prima se ingresan por jabón, se multiplican por el tamaño del lote y se muestra el costo por barra.
- Precios editables al detalle, por mayor y para eventos; calcula ganancia por barra y margen bruto (`(precio - costo) / precio`).
- Registro transaccional de producción: verifica existencias y descuenta materias primas.
- Ventas en borrador y comprobantes internos numerados; al emitirlos valida las existencias de jabones terminados (producción menos ventas), registra la venta y permite imprimir o reimprimir la factura.
- Registro de compras por materia prima, insumo indirecto o utensilio, con proveedor, costo unitario y forma de pago; las compras acumulan stock/costo y rendimiento o vida útil según el tipo.
- Control de cobros, pagos y gastos, con estado de resultados por período y balance general de gestión.
- Exportación de los datos visibles a JSON.
- Acceso a la interfaz mediante un código y sesión anónima de Supabase; las sesiones anónimas comparten el inventario.

**Importante:** `8863` se valida en React y puede encontrarse inspeccionando los archivos del frontend; es una pantalla de acceso, no una autenticación segura. Todas las sesiones anónimas comparten el mismo inventario y pueden consultar, crear, editar o eliminar sus registros. Por tanto, cualquier persona que pueda abrir la aplicación puede acceder a esos datos; para restringir el acceso, configura autenticación real en Supabase y políticas RLS por usuario. Nunca pongas una clave secreta o `service_role` en React.

Los comprobantes de venta y los reportes financieros son internos/de gestión; no tienen validez fiscal ni representan estados auditados. Configura los saldos iniciales en **Finanzas** para reflejar caja, cuentas por cobrar/pagar y capital a la fecha de apertura. El balance muestra inventario, efectivo, cuentas por cobrar, cuentas por pagar y patrimonio; no contempla préstamos, impuestos ni activos fijos como cuentas separadas. Al comprar insumos indirectos, la cantidad representa unidades de rendimiento agregadas; al comprar utensilios, representa usos de vida útil agregados. Si ya habías ejecutado una versión anterior de `supabase/schema.sql`, vuelve a ejecutar el archivo actualizado para habilitar varias selecciones por receta, guardar el costo unitario de materias primas y actualizar el registro de compras.

Al registrar una compra, ingresa el costo de una unidad por artículo; el sistema calcula cada importe como cantidad × costo unitario y actualiza el costo promedio ponderado de la materia prima. El inventario muestra el costo total de las existencias adquiridas (costo unitario × stock inicial y compras); el buscador filtra por código, nombre o unidad y ordena por stock actual de mayor a menor. Si ya tenías datos, vuelve a ejecutar `supabase/schema.sql` para corregir los totales guardados de materia prima según su costo unitario y existencias. Al registrar o editar una materia prima, ingresa su costo por unidad de medida (LPS/g, LPS/ml o LPS/pza). En las recetas, ingresa las cantidades de ingredientes necesarias para un jabón: el costo total del lote multiplica ese consumo por la cantidad de jabones y la producción descuenta del inventario el consumo por jabón multiplicado por los jabones fabricados.
