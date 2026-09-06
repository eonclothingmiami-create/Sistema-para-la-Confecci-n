# Sistema para la Confección

Aplicación web para medir la eficiencia de operarios en un taller de confecciones.

**Nombre visible:** Sistema para la Confección  
**Nombre técnico:** `sistema-para-la-confeccion`

## Fórmulas

- `minutos_entregados_por_operacion = tiempo_estandar_operacion * unidades_entregadas`
- `total_minutos_entregados_dia = suma de minutos_entregados_por_operacion`
- `eficiencia_dia = total_minutos_entregados_dia / capacidad_instalada_dia * 100`

La capacidad instalada es diaria por operario (510 minutos por defecto). Si un operario trabaja varias órdenes el mismo día, el dashboard suma minutos y usa **una sola** capacidad.

Semáforo:

- Verde: >= 90%
- Amarillo: >= 75% y < 90%
- Rojo: < 75%

## 1. Crear proyecto en Supabase

1. Crea un proyecto en [Supabase](https://supabase.com/dashboard).
2. En **Authentication → Providers**, deja habilitado **Email**.
3. Desactiva el registro público si no quieres que cualquiera cree cuentas (**Authentication → Providers → Email → Confirm email / disable signups** según tu plan).
4. Crea usuarios a mano en **Authentication → Users**. La app es **solo login**.

## 2. Variables de entorno

Copia `.env.example` a `.env`:

```
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_or_publishable_key
```

Usa solo la **anon** o **publishable** key.  
**Nunca uses `service_role` ni `sb_secret` en el frontend ni en este repositorio.**

## 3. Ejecutar migraciones

En el SQL Editor de Supabase, ejecuta en este orden:

1. [`supabase/migrations/20240906120000_init_schema.sql`](supabase/migrations/20240906120000_init_schema.sql)
2. Opcional: [`supabase/seed.sql`](supabase/seed.sql) (3 operarios, 2 referencias, 2 lotes y un ejemplo 71.9%)

Si usas Supabase CLI:

```bash
npx supabase db push
npx supabase db query -f supabase/seed.sql
```

## 4. Correr local

```bash
npm install
npm run dev
```

Abre `http://localhost:5173`. Entra con un usuario creado en Supabase Auth.

## 5. Build

```bash
npm run build
npm run preview
```

## 6. Deploy en GitHub Pages

La app usa `HashRouter`, así que las rutas no se rompen al refrescar.

1. Crea el repo `sistema-para-la-confeccion`.
2. En el repo: **Settings → Secrets and variables → Actions** y agrega:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. **Settings → Pages → Source:** GitHub Actions.
4. El workflow [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml) construye con `GITHUB_PAGES=true` (base `/sistema-para-la-confeccion/`) y publica `dist`.

URL esperada: `https://<usuario>.github.io/sistema-para-la-confeccion/`

En **Authentication → URL Configuration** de Supabase agrega esa URL a **Site URL** y **Redirect URLs**.

## 7. Alternativa gratuita: Vercel o Netlify

Si GitHub Pages complica las variables o el dominio:

### Vercel Free

1. Importa el repo.
2. Framework: Vite.
3. Env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
4. No hace falta `GITHUB_PAGES`; el `base` queda `/`.

### Netlify Free

1. Build command: `npm run build`
2. Publish directory: `dist`
3. Las mismas variables `VITE_*`.

## 8. Cómo habilitar Realtime

La migración intenta agregar estas tablas a `supabase_realtime`:

- `daily_production_headers`
- `daily_production_entries`
- `operators`
- `production_orders`

Si no quedó activo, en **Database → Publications → supabase_realtime** márcalas, o ejecuta:

```sql
alter publication supabase_realtime add table public.daily_production_headers;
alter publication supabase_realtime add table public.daily_production_entries;
alter publication supabase_realtime add table public.operators;
alter publication supabase_realtime add table public.production_orders;
```

El frontend se suscribe y refresca el dashboard automáticamente.

## 9. Roles

`profiles.role` admite `admin`, `supervisor` y `consulta`.  
En v1, cualquier usuario autenticado puede hacer CRUD. Los TODOs para endurecer RLS por rol están en la migración.

## Advertencia de seguridad

- Nunca pegues `service_role` o `sb_secret` en `.env`, Vite, GitHub Secrets de frontend ni el código.
- Solo variables públicas `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
- `.env` está en `.gitignore`.
