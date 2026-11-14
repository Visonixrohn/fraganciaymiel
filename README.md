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

## Funciones

- Inventario de materias primas con alertas, existencias y costo unitario.
- Control de insumos indirectos y depreciación de utensilios.
- Creación de recetas, simulación de costos y precios por margen.
- Registro transaccional de producción: verifica existencias y descuenta materias primas.
- Exportación de los datos visibles a JSON.
- Acceso a la interfaz mediante un código y sesión anónima de Supabase; RLS mantiene aislados los datos de cada sesión anónima.

**Importante:** `8863` se valida en React y puede encontrarse inspeccionando los archivos del frontend; es una pantalla de acceso, no una autenticación segura. Cada navegador crea su propia sesión anónima y sus propios datos; no se comparten automáticamente entre dispositivos. Para proteger el acceso con el código en servidor o compartir los datos de forma privada entre dispositivos, configura una función de autenticación segura. Nunca pongas una clave secreta o `service_role` en React.
