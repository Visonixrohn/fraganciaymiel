import { useCallback, useEffect, useMemo, useState } from 'react';
import { isSupabaseConfigured, supabase } from './supabase.js';

const tabs = [
  ['materials', 'Materia prima', '◈'],
  ['indirects', 'Insumos indirectos', '✳'],
  ['utensils', 'Utensilios', '⌑'],
  ['recipes', 'Calculadora y recetas', '⌗'],
  ['production', 'Producción', '▤'],
  ['sales', 'Pedidos y facturas', '▧'],
];

const money = (value) => `L ${Number(value || 0).toFixed(2)}`;
const number = (value) => Number(value || 0);
const makeCode = () => `LOTE-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${Math.floor(Math.random() * 900 + 100)}`;
const ACCESS_CODE = '8863';
const priceTypes = [
  ['detail', 'Detalle'],
  ['wholesale', 'Por mayor'],
  ['event', 'Eventos'],
];
const paymentMethods = [
  ['cash', 'Efectivo'],
  ['transfer', 'Transferencia'],
  ['card', 'Tarjeta'],
  ['other', 'Otro'],
];

const fromMaterial = (row) => ({
  ...row,
  initial: number(row.initial_stock),
  purchased: number(row.purchased),
  used: number(row.used),
  min: number(row.minimum_stock),
  totalCost: number(row.total_cost),
});
const fromIndirect = (row) => ({ ...row, yieldVal: number(row.yield_value), cost: number(row.cost) });
const fromUtensil = (row) => ({ ...row, cost: number(row.cost), life: number(row.useful_life) });
const fromRecipe = (row) => ({
  ...row,
  batchSize: number(row.batch_size),
  soapWeight: number(row.soap_weight),
  indirectId: row.indirect_id,
  utId: row.utensil_id,
  margin: number(row.margin),
  prices: {
    detail: row.price_detail == null ? null : number(row.price_detail),
    wholesale: row.price_wholesale == null ? null : number(row.price_wholesale),
    event: row.price_event == null ? null : number(row.price_event),
  },
  items: (row.recipe_items || []).map((item) => ({
    materialId: item.material_id,
    qty: number(item.quantity),
  })),
});

function App() {
  const [session, setSession] = useState(null);
  const [unlocked, setUnlocked] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(null);
  const [tab, setTab] = useState('materials');
  const [data, setData] = useState({
    materials: [],
    indirects: [],
    utensils: [],
    recipes: [],
    batches: [],
    sales: [],
  });
  const [modal, setModal] = useState(null);
  const [saleDraft, setSaleDraft] = useState(null);
  const [recipe, setRecipe] = useState({
    id: '',
    name: '',
    batchSize: 10,
    soapWeight: 100,
    indirectId: '',
    utId: '',
    margin: 100,
    prices: { detail: null, wholesale: null, event: null },
    items: [{ materialId: '', qty: '' }],
  });
  const toast = useCallback((message, type = 'success') => {
    setNotice({ message, type });
    window.setTimeout(() => setNotice(null), 4200);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setAuthLoading(false);
      setError('Faltan las variables de conexión de Supabase. Revisa el archivo .env y reinicia el servidor.');
      return undefined;
    }

    supabase.auth.getSession().then(({ data: result, error: sessionError }) => {
      if (sessionError) setError(sessionError.message);
      setSession(result.session);
      setUnlocked(Boolean(result.session));
      setAuthLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      if (event === 'INITIAL_SESSION') setUnlocked(Boolean(nextSession));
      if (!nextSession) setUnlocked(false);
      setError('');
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const loadData = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError('');
    const queries = await Promise.all([
      supabase.from('materials').select('*').order('name'),
      supabase.from('indirects').select('*').order('name'),
      supabase.from('utensils').select('*').order('name'),
      supabase.from('recipes').select('*, recipe_items(*)').order('name'),
      supabase.from('batches').select('*').order('created_at', { ascending: false }),
      supabase.from('sales').select('*, sale_items(*)').order('created_at', { ascending: false }),
    ]);
    const failed = queries.find(({ error: queryError }) => queryError);
    if (failed) {
      setError(failed.error.message);
    } else {
      const [materials, indirects, utensils, recipes, batches, sales] = queries.map((result) => result.data);
      setData({
        materials: materials.map(fromMaterial),
        indirects: indirects.map(fromIndirect),
        utensils: utensils.map(fromUtensil),
        recipes: recipes.map(fromRecipe),
        batches,
        sales,
      });
    }
    setLoading(false);
  }, [session]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const metrics = useMemo(() => ({
    materials: data.materials.length,
    alerts: data.materials.filter((item) => item.initial + item.purchased - item.used <= item.min).length,
    recipes: data.recipes.length,
    batches: data.batches.length,
  }), [data]);

  const costs = useMemo(() => {
    const batchSize = Math.max(1, number(recipe.batchSize));
    const materials = recipe.items.reduce((sum, item) => {
      const material = data.materials.find((entry) => entry.id === item.materialId);
      if (!material) return sum;
      const available = material.initial + material.purchased;
      return sum + (available > 0 ? material.totalCost / available : 0) * number(item.qty);
    }, 0);
    const indirect = data.indirects.find((item) => item.id === recipe.indirectId);
    const utensil = data.utensils.find((item) => item.id === recipe.utId);
    const indirectCost = indirect && indirect.yieldVal > 0 ? (indirect.cost / indirect.yieldVal) * batchSize : 0;
    const utensilCost = utensil && utensil.life > 0 ? (utensil.cost / utensil.life) * batchSize : 0;
    const total = materials + indirectCost + utensilCost;
    const unit = total / batchSize;
    return { materials, indirect: indirectCost, utensil: utensilCost, total, unit };
  }, [data, recipe]);

  const salePrices = useMemo(() => {
    const markup = number(recipe.margin);
    return {
      detail: recipe.prices.detail ?? costs.unit * (1 + markup / 100),
      wholesale: recipe.prices.wholesale ?? costs.unit * (1 + markup * 0.8 / 100),
      event: recipe.prices.event ?? costs.unit * (1 + markup * 0.7 / 100),
    };
  }, [costs.unit, recipe.margin, recipe.prices]);

  const saleDraftTotal = useMemo(() => {
    if (!saleDraft) return 0;
    return saleDraft.items.reduce((total, item) => {
      const product = data.recipes.find((entry) => entry.id === item.recipeId);
      return total + number(product?.prices?.[item.priceType]) * number(item.quantity);
    }, 0);
  }, [data.recipes, saleDraft]);

  function availableFinishedStock(recipeId) {
    const produced = data.batches
      .filter((batch) => batch.recipe_id === recipeId)
      .reduce((sum, batch) => sum + number(batch.quantity), 0);
    const sold = data.sales
      .filter((sale) => sale.status === 'issued')
      .flatMap((sale) => sale.sale_items || [])
      .filter((item) => item.recipe_id === recipeId)
      .reduce((sum, item) => sum + number(item.quantity), 0);
    return produced - sold;
  }

  async function handleAccessCode(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (form.get('accessCode') !== ACCESS_CODE) {
      setError('El código de acceso no es válido.');
      return;
    }

    setLoading(true);
    setError('');
    if (!session) {
      const { data: result, error: signInError } = await supabase.auth.signInAnonymously();
      if (signInError) {
        setError(signInError.message);
        setLoading(false);
        return;
      }
      setSession(result.session);
    }
    setUnlocked(true);
    setLoading(false);
    toast('Acceso concedido');
  }

  async function lockApp() {
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      toast(signOutError.message, 'error');
      return;
    }
    setUnlocked(false);
  }

  function openEntity(kind, item = null) {
    const fields = {
      materials: item
        ? { code: item.code, name: item.name, unit: item.unit, min: item.min, initial: item.initial, purchased: item.purchased, totalCost: item.totalCost }
        : { code: '', name: '', unit: 'g', min: '', initial: 0, purchased: 0, totalCost: '' },
      indirects: item
        ? { code: item.code, name: item.name, type: item.type, cost: item.cost, yieldVal: item.yieldVal }
        : { code: '', name: '', type: 'Envase / Botella', cost: '', yieldVal: '' },
      utensils: item
        ? { code: item.code, name: item.name, cost: item.cost, life: item.life }
        : { code: '', name: '', cost: '', life: '' },
    };
    setModal({ kind, item, values: fields[kind] });
  }

  async function saveEntity(event) {
    event.preventDefault();
    const { kind, item, values } = modal;
    const common = { owner_id: session.user.id, code: values.code.trim(), name: values.name.trim() };
    const records = {
      materials: {
        ...common,
        unit: values.unit,
        minimum_stock: number(values.min),
        initial_stock: number(values.initial),
        purchased: number(values.purchased),
        total_cost: number(values.totalCost),
      },
      indirects: {
        ...common,
        type: values.type,
        cost: number(values.cost),
        yield_value: number(values.yieldVal),
      },
      utensils: {
        ...common,
        cost: number(values.cost),
        useful_life: number(values.life),
      },
    };
    const query = supabase.from(kind);
    const result = item
      ? await query.update(records[kind]).eq('id', item.id)
      : await query.insert(records[kind]);
    if (result.error) {
      toast(result.error.message, 'error');
      return;
    }
    setModal(null);
    toast(item ? 'Registro actualizado' : 'Registro creado');
    await loadData();
  }

  async function deleteRow(table, id, label) {
    if (!window.confirm(`¿Eliminar ${label}?`)) return;
    const { error: deleteError } = await supabase.from(table).delete().eq('id', id);
    if (deleteError) {
      toast(deleteError.message, 'error');
      return;
    }
    toast('Registro eliminado');
    await loadData();
  }

  function editRecipe(item) {
    setRecipe({
      id: item.id,
      name: item.name,
      batchSize: item.batchSize,
      soapWeight: item.soapWeight,
      indirectId: item.indirectId || '',
      utId: item.utId || '',
      margin: item.margin ?? 100,
      prices: item.prices,
      items: item.items.length ? item.items.map((row) => ({ ...row })) : [{ materialId: '', qty: '' }],
    });
    setTab('recipes');
  }

  async function saveRecipe(event) {
    event.preventDefault();
    if (Object.values(salePrices).some((price) => price === '' || price == null || !Number.isFinite(Number(price)))) {
      toast('Completa los tres precios de venta antes de guardar la receta.', 'error');
      return;
    }
    const items = recipe.items
      .filter((item) => item.materialId && number(item.qty) > 0)
      .map((item) => ({ material_id: item.materialId, quantity: number(item.qty) }));
    if (!items.length) {
      toast('Agrega por lo menos una materia prima a la receta.', 'error');
      return;
    }
    const { error: saveError } = await supabase.rpc('save_recipe', {
      p_recipe_id: recipe.id || null,
      p_name: recipe.name.trim(),
      p_batch_size: number(recipe.batchSize),
      p_soap_weight: number(recipe.soapWeight),
      p_indirect_id: recipe.indirectId || null,
      p_utensil_id: recipe.utId || null,
      p_margin: number(recipe.margin),
      p_price_detail: number(salePrices.detail),
      p_price_wholesale: number(salePrices.wholesale),
      p_price_event: number(salePrices.event),
      p_items: items,
    });
    if (saveError) {
      toast(saveError.message, 'error');
      return;
    }
    setRecipe({
      id: '', name: '', batchSize: 10, soapWeight: 100, indirectId: '', utId: '', margin: 100,
      prices: { detail: null, wholesale: null, event: null },
      items: [{ materialId: '', qty: '' }],
    });
    toast('Receta guardada');
    await loadData();
  }

  async function produceBatch(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const { error: produceError } = await supabase.rpc('produce_batch', {
      p_recipe_id: form.get('recipeId'),
      p_code: String(form.get('code')).trim(),
      p_quantity: number(form.get('quantity')),
    });
    if (produceError) {
      toast(produceError.message, 'error');
      return;
    }
    setModal(null);
    toast('Lote registrado y existencias actualizadas');
    await loadData();
  }

  function openSalesOrder(sale = null) {
    setSaleDraft(sale
      ? {
        id: sale.id,
        customerName: sale.customer_name === 'Cliente general' ? '' : sale.customer_name,
        customerPhone: sale.customer_phone || '',
        paymentMethod: sale.payment_method,
        items: (sale.sale_items || []).map((item) => ({
          recipeId: item.recipe_id,
          quantity: String(item.quantity),
          priceType: item.price_type,
        })),
      }
      : {
        id: '',
        customerName: '',
        customerPhone: '',
        paymentMethod: 'cash',
        items: [{ recipeId: '', quantity: '1', priceType: 'detail' }],
      });
    setModal({ kind: 'sale' });
  }

  async function saveSalesOrder(event) {
    event.preventDefault();
    const items = saleDraft.items
      .filter((item) => item.recipeId)
      .map((item) => ({
        recipe_id: item.recipeId,
        quantity: number(item.quantity),
        price_type: item.priceType,
      }));
    if (!items.length || items.some((item) => item.quantity < 1)) {
      toast('Agrega productos y cantidades válidas al pedido.', 'error');
      return;
    }

    const { error: saveError } = await supabase.rpc('save_sales_order', {
      p_sale_id: saleDraft.id || null,
      p_customer_name: saleDraft.customerName.trim() || null,
      p_customer_phone: saleDraft.customerPhone.trim() || null,
      p_payment_method: saleDraft.paymentMethod,
      p_items: items,
    });
    if (saveError) {
      toast(saveError.message, 'error');
      return;
    }
    setModal(null);
    setSaleDraft(null);
    toast('Pedido guardado en borrador');
    await loadData();
  }

  async function issueSalesOrder(sale) {
    if (!window.confirm('¿Emitir el comprobante? Se validará y descontará el stock de jabones terminados.')) return;
    const { error: issueError } = await supabase.rpc('issue_sales_order', { p_sale_id: sale.id });
    if (issueError) {
      toast(issueError.message, 'error');
      return;
    }

    const { data: invoice, error: invoiceError } = await supabase
      .from('sales')
      .select('*, sale_items(*)')
      .eq('id', sale.id)
      .single();
    await loadData();
    if (invoiceError) {
      toast(`Comprobante emitido, pero no se pudo cargar para imprimir: ${invoiceError.message}`, 'error');
      return;
    }
    setModal({ kind: 'invoice', sale: invoice });
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `backup-fragancia-y-miel-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async function importData(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const backup = JSON.parse(await file.text());
      const categories = ['materials', 'indirects', 'utensils', 'recipes', 'batches'];
      if (!backup || categories.some((category) => !Array.isArray(backup[category]))) {
        throw new Error('El archivo no contiene un respaldo válido de Fragancia y Miel.');
      }

      const idMaps = { materials: new Map(), indirects: new Map(), utensils: new Map(), recipes: new Map() };
      const sources = {
        materials: backup.materials.map((row) => ({
          owner_id: session.user.id,
          code: row.code,
          name: row.name,
          unit: row.unit,
          initial_stock: number(row.initial_stock ?? row.initial),
          purchased: number(row.purchased),
          used: number(row.used),
          minimum_stock: number(row.minimum_stock ?? row.min),
          total_cost: number(row.total_cost ?? row.totalCost),
        })),
        indirects: backup.indirects.map((row) => ({
          owner_id: session.user.id,
          code: row.code,
          name: row.name,
          type: row.type,
          cost: number(row.cost),
          yield_value: number(row.yield_value ?? row.yieldVal),
        })),
        utensils: backup.utensils.map((row) => ({
          owner_id: session.user.id,
          code: row.code,
          name: row.name,
          cost: number(row.cost),
          useful_life: number(row.useful_life ?? row.life),
        })),
      };

      for (const kind of ['materials', 'indirects', 'utensils']) {
        if (!sources[kind].length) continue;
        const { data: saved, error: importError } = await supabase
          .from(kind)
          .upsert(sources[kind], { onConflict: 'owner_id,code' })
          .select('id, code');
        if (importError) throw importError;
        const original = new Map(backup[kind].map((row) => [row.code, row]));
        saved.forEach((row) => {
          const previous = original.get(row.code);
          if (previous?.id) idMaps[kind].set(previous.id, row.id);
          idMaps[kind].set(row.code, row.id);
        });
      }

      const recipeNames = new Map(data.recipes.map((row) => [row.name, row.id]));
      for (const row of backup.recipes) {
        const ingredients = (row.items || row.recipe_items || []).map((item) => {
          const previousMaterialId = item.materialId || item.material_id;
          const materialId = idMaps.materials.get(previousMaterialId)
            || idMaps.materials.get(item.code);
          if (!materialId) throw new Error(`No se encontró la materia prima de la receta "${row.name}".`);
          return { material_id: materialId, quantity: number(item.qty ?? item.quantity) };
        });
        const { data: savedId, error: importError } = await supabase.rpc('save_recipe', {
          p_recipe_id: recipeNames.get(row.name) || null,
          p_name: row.name,
          p_batch_size: number(row.batch_size ?? row.batchSize),
          p_soap_weight: number(row.soap_weight ?? row.soapWeight),
          p_indirect_id: idMaps.indirects.get(row.indirect_id || row.indirectId) || null,
          p_utensil_id: idMaps.utensils.get(row.utensil_id || row.utId) || null,
          p_margin: number(row.margin ?? 100),
          p_price_detail: row.price_detail ?? row.prices?.detail ?? null,
          p_price_wholesale: row.price_wholesale ?? row.prices?.wholesale ?? null,
          p_price_event: row.price_event ?? row.prices?.event ?? null,
          p_items: ingredients,
        });
        if (importError) throw importError;
        if (row.id) idMaps.recipes.set(row.id, savedId);
        idMaps.recipes.set(row.name, savedId);
        recipeNames.set(row.name, savedId);
      }

      const batches = backup.batches.map((row) => {
        const recipeName = row.recipe_name || row.recipeName;
        const batchDate = row.batch_date || (typeof row.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.date) ? row.date : null);
        return {
          owner_id: session.user.id,
          recipe_id: idMaps.recipes.get(row.recipe_id || row.recipeId) || recipeNames.get(recipeName) || null,
          recipe_name: recipeName,
          code: row.code,
          quantity: number(row.quantity ?? row.qty),
          batch_date: batchDate || new Date().toISOString().slice(0, 10),
          total_cost: number(row.total_cost ?? row.totalCost),
          unit_cost: number(row.unit_cost ?? row.unitCost),
        };
      });
      if (batches.length) {
        const { error: importError } = await supabase
          .from('batches')
          .upsert(batches, { onConflict: 'owner_id,code' });
        if (importError) throw importError;
      }
      toast('Respaldo importado correctamente');
    } catch (importError) {
      toast(importError.message || 'No se pudo importar el archivo.', 'error');
    } finally {
      event.target.value = '';
      await loadData();
    }
  }

  if (authLoading) return <div className="loading-screen">Cargando Fragancia y Miel…</div>;
  if (!isSupabaseConfigured) return <div className="center-screen"><Notice type="error">{error}</Notice></div>;
  if (!unlocked || !session) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="brand-mark">✿</div>
          <p className="eyebrow">JABONERÍA ARTESANAL</p>
          <h1>Fragancia <span>&</span> Miel</h1>
          <p className="muted">Ingresa tu código para continuar.</p>
          {error && <Notice type="error">{error}</Notice>}
          <form onSubmit={handleAccessCode} className="stack-form">
            <label>Código de acceso<input name="accessCode" type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength="4" autoComplete="off" autoFocus required /></label>
            <button className="button primary wide" disabled={loading}>{loading ? 'Verificando…' : 'Ingresar'}</button>
          </form>
          <p className="auth-footnote">Sistema de control · Fragancia & Miel</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" onClick={(event) => event.preventDefault()}>
          <span className="brand-icon">✿</span>
          <span>Fragancia <i>&</i> Miel<small>CONTROL DE PRODUCCIÓN</small></span>
        </a>
        <div className="top-actions">
          <span className="currency-label">LPS <span>· Lempiras</span></span>
          <button className="button ghost" onClick={exportData}>↓ <span>Exportar</span></button>
          <button className="button ghost" onClick={() => document.getElementById('import-backup').click()}>↑ <span>Importar</span></button>
          <input id="import-backup" className="file-input" type="file" accept="application/json,.json" onChange={importData} />
          <button className="button ghost" onClick={lockApp}>Salir</button>
        </div>
      </header>

      <main className="main-content">
        <div className="welcome-row">
          <div><p className="eyebrow">PANEL DE CONTROL</p><h1>Tu taller, en orden.</h1><p className="muted">Inventario, recetas y producción en un solo lugar.</p></div>
          <button className="button primary" onClick={() => { setModal({ kind: 'production' }); }}>＋ Registrar producción</button>
        </div>

        {error && <Notice type="error">{error}</Notice>}
        <section className="metrics-grid">
          <Metric label="Materias primas" value={metrics.materials} detail="Insumos registrados" icon="◈" />
          <Metric label="Stock bajo" value={metrics.alerts} detail="Requieren reposición" icon="⚠" warning={metrics.alerts > 0} />
          <Metric label="Recetas" value={metrics.recipes} detail="Fichas técnicas" icon="⌗" />
          <Metric label="Lotes producidos" value={metrics.batches} detail="Producciones registradas" icon="▤" />
        </section>

        <nav className="tabs" aria-label="Secciones del sistema">
          {tabs.map(([id, title, icon]) => (
            <button key={id} className={tab === id ? 'tab active' : 'tab'} onClick={() => setTab(id)}>
              <span>{icon}</span>{title}
            </button>
          ))}
        </nav>

        {loading && <div className="loading-inline">Sincronizando datos con Supabase…</div>}
        {tab === 'materials' && (
          <Section title="Inventario de materia prima directa" subtitle="Controla existencias, compras y alertas de reposición" action="＋ Nueva materia prima" onAction={() => openEntity('materials')}>
            <Table headers={['Código', 'Insumo', 'Unidad', 'Stock inicial', 'Compras', 'Usado', 'Stock actual', 'Mínimo', 'Costo compra', 'Costo unitario', 'Estado', '']}>
              {data.materials.map((item) => {
                const stock = item.initial + item.purchased - item.used;
                const low = stock <= item.min;
                return <tr key={item.id}>
                  <td><code>{item.code}</code></td><td className="strong">{item.name}</td><td>{item.unit}</td>
                  <td>{item.initial}</td><td>{item.purchased}</td><td>{item.used.toFixed(2)}</td><td className="strong">{stock.toFixed(2)}</td><td>{item.min}</td>
                  <td>{money(item.totalCost)}</td><td className="green">{money(item.totalCost / Math.max(1, item.initial + item.purchased))}</td>
                  <td><span className={`pill ${low ? 'danger' : 'good'}`}>{low ? 'Reordenar' : 'Óptimo'}</span></td>
                  <Actions onEdit={() => openEntity('materials', item)} onDelete={() => deleteRow('materials', item.id, 'esta materia prima')} />
                </tr>;
              })}
            </Table>
          </Section>
        )}
        {tab === 'indirects' && (
          <Section title="Insumos indirectos" subtitle="Gastos y consumibles asignados a cada barra" action="＋ Nuevo insumo indirecto" onAction={() => openEntity('indirects')}>
            <Table headers={['Código', 'Nombre', 'Tipo', 'Costo', 'Rendimiento', 'Cuota por jabón', '']}>
              {data.indirects.map((item) => <tr key={item.id}>
                <td><code>{item.code}</code></td><td className="strong">{item.name}</td><td>{item.type}</td><td>{money(item.cost)}</td>
                <td>{item.yieldVal} jabones</td><td className="green">{money(item.cost / Math.max(1, item.yieldVal))}</td>
                <Actions onEdit={() => openEntity('indirects', item)} onDelete={() => deleteRow('indirects', item.id, 'este insumo indirecto')} />
              </tr>)}
            </Table>
          </Section>
        )}
        {tab === 'utensils' && (
          <Section title="Utensilios y depreciación" subtitle="Distribuye el costo de moldes y herramientas por unidad" action="＋ Nuevo utensilio" onAction={() => openEntity('utensils')}>
            <Table headers={['Código', 'Utensilio / molde', 'Costo de adquisición', 'Vida útil', 'Depreciación por jabón', '']}>
              {data.utensils.map((item) => <tr key={item.id}>
                <td><code>{item.code}</code></td><td className="strong">{item.name}</td><td>{money(item.cost)}</td>
                <td>{item.life} jabones</td><td className="green">{money(item.cost / Math.max(1, item.life))}</td>
                <Actions onEdit={() => openEntity('utensils', item)} onDelete={() => deleteRow('utensils', item.id, 'este utensilio')} />
              </tr>)}
            </Table>
          </Section>
        )}
        {tab === 'recipes' && (
          <div className="recipe-layout">
            <Section title={recipe.id ? 'Editar ficha técnica' : 'Creador de receta'} subtitle="Define ingredientes, tamaño del lote y costos" className="recipe-editor">
              <form className="stack-form" onSubmit={saveRecipe}>
                <label>Nombre de la receta<input value={recipe.name} onChange={(event) => setRecipe({ ...recipe, name: event.target.value })} placeholder="Ej. Jabón de miel y avena" required /></label>
                <div className="form-grid">
                  <label>Tamaño del lote (jabones)<input type="number" min="1" value={recipe.batchSize} onChange={(event) => setRecipe({ ...recipe, batchSize: event.target.value })} required /></label>
                  <label>Peso por barra (g)<input type="number" min="1" value={recipe.soapWeight} onChange={(event) => setRecipe({ ...recipe, soapWeight: event.target.value })} required /></label>
                </div>
                <div className="list-heading"><h3>Materia prima del lote</h3><button type="button" className="text-button" onClick={() => setRecipe({ ...recipe, items: [...recipe.items, { materialId: '', qty: '' }] })}>＋ Agregar ingrediente</button></div>
                {recipe.items.map((item, index) => (
                  <div className="ingredient-row" key={index}>
                    <select aria-label="Materia prima" value={item.materialId} onChange={(event) => setRecipe({ ...recipe, items: recipe.items.map((row, i) => i === index ? { ...row, materialId: event.target.value } : row) })}>
                      <option value="">Selecciona un insumo</option>
                      {data.materials.map((material) => <option key={material.id} value={material.id}>{material.name} ({material.unit})</option>)}
                    </select>
                    <input type="number" min="0" step="any" placeholder="Cantidad" aria-label="Cantidad" value={item.qty} onChange={(event) => setRecipe({ ...recipe, items: recipe.items.map((row, i) => i === index ? { ...row, qty: event.target.value } : row) })} />
                    <button type="button" className="icon-button danger-text" aria-label="Quitar ingrediente" onClick={() => setRecipe({ ...recipe, items: recipe.items.filter((_, i) => i !== index) })}>×</button>
                  </div>
                ))}
                <div className="form-grid">
                  <label>Insumo indirecto<select value={recipe.indirectId} onChange={(event) => setRecipe({ ...recipe, indirectId: event.target.value })}><option value="">Ninguno</option>{data.indirects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                  <label>Utensilio / molde<select value={recipe.utId} onChange={(event) => setRecipe({ ...recipe, utId: event.target.value })}><option value="">Ninguno</option>{data.utensils.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                </div>
                <button className="button primary wide">{recipe.id ? 'Guardar cambios' : 'Guardar receta'}</button>
                {recipe.id && <button type="button" className="button secondary wide" onClick={() => setRecipe({ id: '', name: '', batchSize: 10, soapWeight: 100, indirectId: '', utId: '', margin: 100, prices: { detail: null, wholesale: null, event: null }, items: [{ materialId: '', qty: '' }] })}>Cancelar edición</button>}
              </form>
            </Section>
            <div className="recipe-side">
              <section className="panel cost-panel">
                <div className="section-heading"><div><p className="eyebrow">RESUMEN DE COSTOS · LPS</p><h2>Tu receta, al detalle.</h2></div></div>
                <div className="cost-lines">
                  <CostLine label="Materia prima" value={costs.materials} />
                  <CostLine label="Insumos indirectos" value={costs.indirect} />
                  <CostLine label="Depreciación" value={costs.utensil} />
                  <CostLine label="Costo total del lote" value={costs.total} strong />
                </div>
                <div className="unit-cost"><span>Costo por barra</span><strong>{money(costs.unit)}</strong></div>
                <p className="margin-explainer">Ingresa el precio de venta por canal. El margen se calcula como ganancia ÷ precio de venta.</p>
                <div className="prices">
                  <PriceEditor label="Detalle" value={salePrices.detail} cost={costs.unit} onChange={(value) => setRecipe({ ...recipe, prices: { ...recipe.prices, detail: value } })} />
                  <PriceEditor label="Por mayor" value={salePrices.wholesale} cost={costs.unit} onChange={(value) => setRecipe({ ...recipe, prices: { ...recipe.prices, wholesale: value } })} />
                  <PriceEditor label="Eventos" value={salePrices.event} cost={costs.unit} onChange={(value) => setRecipe({ ...recipe, prices: { ...recipe.prices, event: value } })} />
                </div>
              </section>
              <Section title="Recetas guardadas" subtitle={`${data.recipes.length} fichas técnicas`}>
                <div className="saved-recipes">
                  {data.recipes.map((item) => <div className="saved-recipe" key={item.id}>
                    <button className="recipe-name" onClick={() => editRecipe(item)}><strong>{item.name}</strong><small>{item.batchSize} barras · {item.soapWeight} g c/u</small></button>
                    <button className="icon-button danger-text" aria-label={`Eliminar ${item.name}`} onClick={() => deleteRow('recipes', item.id, 'esta receta')}>×</button>
                  </div>)}
                  {data.recipes.length === 0 && <Empty text="Guarda tu primera receta para verla aquí." />}
                </div>
              </Section>
            </div>
          </div>
        )}
        {tab === 'production' && (
          <Section title="Historial de producción" subtitle="Lotes registrados y costos reales" action="＋ Registrar producción" onAction={() => setModal({ kind: 'production' })}>
            <Table headers={['Fecha', 'Código de lote', 'Receta', 'Cantidad', 'Costo total', 'Costo por barra', '']}>
              {data.batches.map((batch) => <tr key={batch.id}>
                <td>{new Date(`${batch.batch_date}T12:00:00`).toLocaleDateString('es-HN')}</td>
                <td><code>{batch.code}</code></td><td className="strong">{batch.recipe_name}</td><td>{batch.quantity} jabones</td>
                <td>{money(batch.total_cost)}</td><td className="green">{money(batch.unit_cost)}</td>
                <Actions onDelete={() => deleteRow('batches', batch.id, 'este lote')} />
              </tr>)}
            </Table>
          </Section>
        )}
        {tab === 'sales' && (
          <Section title="Pedidos y comprobantes" subtitle="Guarda pedidos y emite comprobantes al confirmar la venta" action="＋ Nuevo pedido" onAction={() => openSalesOrder()}>
            <Table headers={['N.º / pedido', 'Fecha', 'Cliente', 'Unidades', 'Total', 'Estado', 'Acciones']}>
              {data.sales.map((sale) => (
                <tr key={sale.id}>
                  <td><code>{sale.invoice_number || `PED-${sale.id.slice(0, 8).toUpperCase()}`}</code></td>
                  <td>{new Date(`${sale.invoice_date || sale.created_at.slice(0, 10)}T12:00:00`).toLocaleDateString('es-HN')}</td>
                  <td className="strong">{sale.customer_name}</td>
                  <td>{(sale.sale_items || []).reduce((sum, item) => sum + number(item.quantity), 0)}</td>
                  <td className="green">{money(sale.total)}</td>
                  <td><span className={`pill ${sale.status === 'issued' ? 'good' : 'warning'}`}>{sale.status === 'issued' ? 'Emitido' : 'Borrador'}</span></td>
                  <td className="sale-actions">
                    {sale.status === 'draft'
                      ? <>
                        <button className="icon-button" aria-label="Editar pedido" title="Editar pedido" onClick={() => openSalesOrder(sale)}>✎</button>
                        <button className="button primary small" onClick={() => issueSalesOrder(sale)}>Emitir</button>
                      </>
                      : <button className="button secondary small" onClick={() => setModal({ kind: 'invoice', sale })}>Ver / imprimir</button>}
                  </td>
                </tr>
              ))}
            </Table>
          </Section>
        )}
        <footer className="footer">Fragancia & Miel <span>·</span> Control de costos e inventario</footer>
      </main>

      {modal && !['production', 'sale', 'invoice'].includes(modal.kind) && (
        <Dialog title={`${modal.item ? 'Editar' : 'Registrar'} ${modal.kind === 'materials' ? 'materia prima' : modal.kind === 'indirects' ? 'insumo indirecto' : 'utensilio'}`} onClose={() => setModal(null)}>
          <form className="stack-form" onSubmit={saveEntity}>
            <Field label="Código"><input required value={modal.values.code} onChange={(e) => setModal({ ...modal, values: { ...modal.values, code: e.target.value } })} /></Field>
            <Field label={modal.kind === 'materials' ? 'Nombre del insumo' : 'Nombre / descripción'}><input required value={modal.values.name} onChange={(e) => setModal({ ...modal, values: { ...modal.values, name: e.target.value } })} /></Field>
            {modal.kind === 'materials' && <>
              <div className="form-grid">
                <Field label="Unidad"><select value={modal.values.unit} onChange={(e) => setModal({ ...modal, values: { ...modal.values, unit: e.target.value } })}><option value="g">Gramos (g)</option><option value="ml">Mililitros (ml)</option><option value="pza">Piezas (pza)</option></select></Field>
                <Field label="Stock mínimo"><input type="number" min="0" step="any" required value={modal.values.min} onChange={(e) => setModal({ ...modal, values: { ...modal.values, min: e.target.value } })} /></Field>
                <Field label="Stock inicial"><input type="number" min="0" step="any" required value={modal.values.initial} onChange={(e) => setModal({ ...modal, values: { ...modal.values, initial: e.target.value } })} /></Field>
                <Field label="Compras / entradas"><input type="number" min="0" step="any" required value={modal.values.purchased} onChange={(e) => setModal({ ...modal, values: { ...modal.values, purchased: e.target.value } })} /></Field>
              </div>
              <Field label="Costo total de compra (LPS)"><input type="number" min="0" step="any" required value={modal.values.totalCost} onChange={(e) => setModal({ ...modal, values: { ...modal.values, totalCost: e.target.value } })} /></Field>
            </>}
            {modal.kind === 'indirects' && <>
              <Field label="Tipo de asignación"><select value={modal.values.type} onChange={(e) => setModal({ ...modal, values: { ...modal.values, type: e.target.value } })}><option>Envase / Botella</option><option>Gasto Mensual Fijo</option></select></Field>
              <div className="form-grid">
                <Field label="Costo (LPS)"><input type="number" min="0" step="any" required value={modal.values.cost} onChange={(e) => setModal({ ...modal, values: { ...modal.values, cost: e.target.value } })} /></Field>
                <Field label="Rendimiento (jabones)"><input type="number" min="1" step="any" required value={modal.values.yieldVal} onChange={(e) => setModal({ ...modal, values: { ...modal.values, yieldVal: e.target.value } })} /></Field>
              </div>
            </>}
            {modal.kind === 'utensils' && <div className="form-grid">
              <Field label="Costo de adquisición (LPS)"><input type="number" min="0" step="any" required value={modal.values.cost} onChange={(e) => setModal({ ...modal, values: { ...modal.values, cost: e.target.value } })} /></Field>
              <Field label="Vida útil (jabones)"><input type="number" min="1" step="any" required value={modal.values.life} onChange={(e) => setModal({ ...modal, values: { ...modal.values, life: e.target.value } })} /></Field>
            </div>}
            <div className="dialog-actions"><button type="button" className="button secondary" onClick={() => setModal(null)}>Cancelar</button><button className="button primary">Guardar</button></div>
          </form>
        </Dialog>
      )}
      {modal?.kind === 'sale' && saleDraft && (
        <Dialog className="sales-dialog" title={saleDraft.id ? 'Editar pedido' : 'Nuevo pedido'} onClose={() => { setModal(null); setSaleDraft(null); }}>
          <form className="stack-form" onSubmit={saveSalesOrder}>
            <div className="form-grid">
              <Field label="Cliente (opcional)"><input value={saleDraft.customerName} placeholder="Cliente general" onChange={(event) => setSaleDraft({ ...saleDraft, customerName: event.target.value })} /></Field>
              <Field label="Teléfono (opcional)"><input value={saleDraft.customerPhone} onChange={(event) => setSaleDraft({ ...saleDraft, customerPhone: event.target.value })} /></Field>
            </div>
            <Field label="Forma de pago">
              <select value={saleDraft.paymentMethod} onChange={(event) => setSaleDraft({ ...saleDraft, paymentMethod: event.target.value })}>
                {paymentMethods.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
            <div className="sale-lines">
              <div className="list-heading"><h3>Productos</h3><button type="button" className="text-button" onClick={() => setSaleDraft({ ...saleDraft, items: [...saleDraft.items, { recipeId: '', quantity: '1', priceType: 'detail' }] })}>＋ Agregar producto</button></div>
              {saleDraft.items.map((item, index) => {
                const product = data.recipes.find((entry) => entry.id === item.recipeId);
                const selectedPrice = product?.prices?.[item.priceType];
                return (
                  <div className="sale-item-row" key={`${index}-${item.recipeId}`}>
                    <select aria-label="Producto" value={item.recipeId} required onChange={(event) => setSaleDraft({
                      ...saleDraft,
                      items: saleDraft.items.map((row, rowIndex) => rowIndex === index ? { ...row, recipeId: event.target.value } : row),
                    })}>
                      <option value="" disabled>Selecciona un jabón</option>
                      {data.recipes.map((recipeItem) => <option key={recipeItem.id} value={recipeItem.id}>{recipeItem.name}</option>)}
                    </select>
                    <select aria-label="Precio" value={item.priceType} onChange={(event) => setSaleDraft({
                      ...saleDraft,
                      items: saleDraft.items.map((row, rowIndex) => rowIndex === index ? { ...row, priceType: event.target.value } : row),
                    })}>
                      {priceTypes.map(([value, label]) => <option key={value} value={value} disabled={product?.prices?.[value] == null}>{label}</option>)}
                    </select>
                    <input aria-label="Cantidad" type="number" min="1" step="1" required value={item.quantity} onChange={(event) => setSaleDraft({
                      ...saleDraft,
                      items: saleDraft.items.map((row, rowIndex) => rowIndex === index ? { ...row, quantity: event.target.value } : row),
                    })} />
                    <span className="sale-line-price">{product ? `Disp. ${availableFinishedStock(product.id)} · ${selectedPrice == null ? 'Sin precio' : money(selectedPrice)}` : '—'}</span>
                    <button type="button" className="icon-button danger-text" aria-label="Quitar producto" onClick={() => setSaleDraft({
                      ...saleDraft,
                      items: saleDraft.items.filter((_, rowIndex) => rowIndex !== index),
                    })}>×</button>
                  </div>
                );
              })}
            </div>
            <div className="sale-total"><span>Total del pedido</span><strong>{money(saleDraftTotal)}</strong></div>
            <p className="form-note">El pedido queda en borrador. Al emitir el comprobante se verifica y descuenta el stock de jabones terminados.</p>
            <div className="dialog-actions">
              <button type="button" className="button secondary" onClick={() => { setModal(null); setSaleDraft(null); }}>Cancelar</button>
              <button className="button primary">Guardar pedido</button>
            </div>
          </form>
        </Dialog>
      )}
      {modal?.kind === 'invoice' && (
        <Dialog className="invoice-dialog" title="Comprobante interno" onClose={() => setModal(null)}>
          <div className="invoice-paper">
            <header className="invoice-brand">
              <div><h1>Fragancia &amp; Miel</h1><p>Jabonería artesanal</p></div>
              <strong>COMPROBANTE INTERNO<br />NO FISCAL</strong>
            </header>
            <div className="invoice-meta">
              <p><span>Número</span><strong>{modal.sale.invoice_number}</strong></p>
              <p><span>Fecha</span><strong>{new Date(`${modal.sale.invoice_date}T12:00:00`).toLocaleDateString('es-HN')}</strong></p>
              <p><span>Cliente</span><strong>{modal.sale.customer_name}</strong></p>
              {modal.sale.customer_phone && <p><span>Teléfono</span><strong>{modal.sale.customer_phone}</strong></p>}
              <p><span>Pago</span><strong>{paymentMethods.find(([value]) => value === modal.sale.payment_method)?.[1] || 'Otro'}</strong></p>
            </div>
            <table className="invoice-table">
              <thead><tr><th>Producto</th><th>Precio</th><th>Cant.</th><th>Importe</th></tr></thead>
              <tbody>{(modal.sale.sale_items || []).map((item) => (
                <tr key={item.id}>
                  <td>{item.recipe_name}<small>{priceTypes.find(([value]) => value === item.price_type)?.[1]}</small></td>
                  <td>{money(item.unit_price)}</td>
                  <td>{item.quantity}</td>
                  <td>{money(item.line_total)}</td>
                </tr>
              ))}</tbody>
            </table>
            <div className="invoice-total"><span>Total</span><strong>{money(modal.sale.total)}</strong></div>
            <p className="invoice-thanks">¡Gracias por tu compra!</p>
          </div>
          <div className="dialog-actions no-print">
            <button type="button" className="button secondary" onClick={() => setModal(null)}>Cerrar</button>
            <button type="button" className="button primary" onClick={() => window.print()}>Imprimir / reimprimir</button>
          </div>
        </Dialog>
      )}
      {modal?.kind === 'production' && (
        <Dialog title="Registrar lote de producción" onClose={() => setModal(null)}>
          {data.recipes.length === 0
            ? <><p className="muted">Primero necesitas guardar una receta para registrar su producción.</p><div className="dialog-actions"><button className="button secondary" onClick={() => setModal(null)}>Cerrar</button><button className="button primary" onClick={() => { setModal(null); setTab('recipes'); }}>Crear receta</button></div></>
            : <form className="stack-form" onSubmit={produceBatch}>
              <label>Receta<select name="recipeId" required defaultValue="" onChange={(event) => { const selected = data.recipes.find((item) => item.id === event.target.value); const quantity = document.querySelector('[name="quantity"]'); if (selected && quantity) quantity.value = selected.batchSize; }}>
                <option value="" disabled>Selecciona una receta</option>{data.recipes.map((item) => <option key={item.id} value={item.id}>{item.name} · lote de {item.batchSize}</option>)}
              </select></label>
              <label>Código / número de lote<input name="code" defaultValue={makeCode()} required /></label>
              <label>Cantidad de jabones<input name="quantity" type="number" min="1" defaultValue="" required /></label>
              <p className="form-note">Al registrar la producción se descontarán las materias primas del inventario. Si no hay existencias suficientes, el lote no se guardará.</p>
              <div className="dialog-actions"><button type="button" className="button secondary" onClick={() => setModal(null)}>Cancelar</button><button className="button primary">Confirmar producción</button></div>
            </form>}
        </Dialog>
      )}
      {notice && <div className={`toast ${notice.type}`}>{notice.type === 'error' ? '!' : '✓'} {notice.message}</div>}
    </div>
  );
}

function Metric({ label, value, detail, icon, warning = false }) {
  return <div className={`metric-card ${warning ? 'metric-warning' : ''}`}><div><span className="metric-label">{label}</span><strong>{value}</strong><small>{detail}</small></div><span className="metric-icon">{icon}</span></div>;
}
function Section({ title, subtitle, action, onAction, className = '', children }) {
  return <section className={`panel ${className}`}><div className="section-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action && <button className="button primary small" onClick={onAction}>{action}</button>}</div>{children}</section>;
}
function Table({ headers, children }) {
  const empty = !children || (Array.isArray(children) && children.length === 0);
  return <div className="table-wrap"><table><thead><tr>{headers.map((header, index) => <th key={`${header}-${index}`}>{header}</th>)}</tr></thead><tbody>{children}{empty && <tr><td colSpan={headers.length}><Empty text="Todavía no hay registros." /></td></tr>}</tbody></table></div>;
}
function Actions({ onEdit, onDelete }) {
  return <td className="actions-cell">{onEdit && <button className="icon-button" aria-label="Editar" title="Editar" onClick={onEdit}>✎</button>}{onDelete && <button className="icon-button danger-text" aria-label="Eliminar" title="Eliminar" onClick={onDelete}>×</button>}</td>;
}
function CostLine({ label, value, strong = false }) {
  return <div className={strong ? 'cost-line cost-total' : 'cost-line'}><span>{label}</span><strong>{money(value)}</strong></div>;
}
function PriceEditor({ label, value, cost, onChange }) {
  const profit = number(value) - cost;
  const hasPrice = value !== '' && value != null;
  const margin = hasPrice && number(value) > 0 ? (profit / number(value)) * 100 : null;
  return (
    <label className="price-card">
      <small>{label}</small>
      <span className="price-input-wrap"><span>L</span><input aria-label={`Precio de venta ${label.toLowerCase()}`} type="number" min="0" step="0.01" value={value} onChange={(event) => onChange(event.target.value)} /></span>
      <strong>{margin === null ? '—' : `${margin.toFixed(1)}% margen`}</strong>
      <small className={hasPrice && profit < 0 ? 'loss' : ''}>Ganancia: {hasPrice ? money(profit) : '—'}</small>
    </label>
  );
}
function Empty({ text }) {
  return <div className="empty-state"><span>✿</span>{text}</div>;
}
function Notice({ type, children }) {
  return <div className={`notice ${type}`} role="alert">{children}</div>;
}
function Dialog({ title, onClose, children, className = '' }) {
  return <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className={`dialog ${className}`} role="dialog" aria-modal="true" aria-label={title}><div className="dialog-heading"><h2>{title}</h2><button className="icon-button" aria-label="Cerrar" onClick={onClose}>×</button></div>{children}</section></div>;
}
function Field({ label, children }) {
  return <label>{label}{children}</label>;
}

export default App;
