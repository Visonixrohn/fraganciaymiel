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

- Inventario de materias primas con alertas, existencias y costo unitario.
- Control de insumos indirectos y depreciación de utensilios.
- Creación de recetas, simulación de costos y precios por margen.
- Precios editables al detalle, por mayor y para eventos; calcula ganancia por barra y margen bruto (`(precio - costo) / precio`).
- Registro transaccional de producción: verifica existencias y descuenta materias primas.
- Exportación de los datos visibles a JSON.
- Acceso a la interfaz mediante un código y sesión anónima de Supabase; las sesiones anónimas comparten el inventario.

**Importante:** `8863` se valida en React y puede encontrarse inspeccionando los archivos del frontend; es una pantalla de acceso, no una autenticación segura. Todas las sesiones anónimas comparten el mismo inventario y pueden consultar, crear, editar o eliminar sus registros. Por tanto, cualquier persona que pueda abrir la aplicación puede acceder a esos datos; para restringir el acceso, configura autenticación real en Supabase y políticas RLS por usuario. Nunca pongas una clave secreta o `service_role` en React.

Si ya habías ejecutado una versión anterior de `supabase/schema.sql`, vuelve a ejecutar el archivo actualizado para permitir el inventario compartido, agregar los precios de venta a las recetas y actualizar las funciones de guardado y producción.
