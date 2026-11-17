import { useCallback, useEffect, useMemo, useState } from 'react';
import { isSupabaseConfigured, supabase } from './supabase.js';

const navigationGroups = [
  {
    label: 'Inventario',
    items: [
      ['soapStock', 'Stock de jabones', '▦'],
      ['materials', 'Materia prima', '◈'],
      ['indirects', 'Insumos indirectos', '✳'],
      ['utensils', 'Utensilios', '⌑'],
    ],
  },
  {
    label: 'Producción',
    items: [
      ['recipes', 'Calculadora y recetas', '⌗'],
      ['savedRecipes', 'Recetas guardadas', '✦'],
      ['production', 'Producción', '▤'],
    ],
  },
  {
    label: 'Comercial',
    items: [
      ['sales', 'Facturación', '▧'],
      ['purchases', 'Compras', '＋'],
      ['webOrders', 'Pedidos web', '🛍'],
    ],
  },
  {
    label: 'Administración',
    items: [
      ['webProducts', 'Productos web', '▣'],
      ['webSettings', 'Configuración web', '⚙'],
      ['finance', 'Finanzas', '＄'],
    ],
  },
];

const money = (value) => `L ${Number(value || 0).toFixed(2)}`;
const unitMoney = (value) => `L ${new Intl.NumberFormat('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 6 }).format(Number(value || 0))}`;
const number = (value) => Number(value || 0);
const today = new Date().toISOString().slice(0, 10);
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

const fromMaterial = (row) => {
  const initial = number(row.initial_stock);
  const purchased = number(row.purchased);
  const acquired = initial + purchased;
  const unitCost = number(row.unit_cost) || number(row.total_cost) / Math.max(1, acquired);
  return {
    ...row,
    initial,
    purchased,
    used: number(row.used),
    min: number(row.minimum_stock),
    totalCost: unitCost * acquired,
    unitCost,
  };
};
const fromIndirect = (row) => ({
  ...row,
  measureUnit: row.measure_unit || 'pza',
  stock: number(row.stock ?? row.yield_value),
  minimumStock: number(row.minimum_stock),
  consumptionPerSoap: number(row.consumption_per_soap ?? 1),
  unitCost: row.unit_cost == null
    ? number(row.cost) / Math.max(1, number(row.yield_value))
    : number(row.unit_cost),
  yieldVal: number(row.yield_value),
  cost: number(row.cost),
});
const fromUtensil = (row) => ({ ...row, cost: number(row.cost), life: number(row.useful_life) });
const fromRecipe = (row) => ({
  ...row,
  batchSize: number(row.batch_size),
  soapWeight: number(row.soap_weight),
  indirectIds: (row.recipe_indirects || []).length
    ? row.recipe_indirects.map((item) => item.indirect_id)
    : [row.indirect_id].filter(Boolean),
  utensilIds: (row.recipe_utensils || []).length
    ? row.recipe_utensils.map((item) => item.utensil_id)
    : [row.utensil_id].filter(Boolean),
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
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [materialSearch, setMaterialSearch] = useState('');
  const [data, setData] = useState({
    materials: [],
    indirects: [],
    utensils: [],
    recipes: [],
    batches: [],
    sales: [],
    purchases: [],
    expenses: [],
    financeSettings: null,
    webSettings: null,
    webProducts: [],
    webOrders: [],
  });
  const [modal, setModal] = useState(null);
  const [saleDraft, setSaleDraft] = useState(null);
  const [purchaseDraft, setPurchaseDraft] = useState(null);
  const [webProductDraft, setWebProductDraft] = useState(null);
  const [webProductFile, setWebProductFile] = useState(null);
  const [webLogoFile, setWebLogoFile] = useState(null);
  const [webSettingsDraft, setWebSettingsDraft] = useState(null);
  const [expenseForm, setExpenseForm] = useState({
    description: '',
    category: '',
    amount: '',
    expenseDate: today,
    paymentStatus: 'paid',
    paymentMethod: 'cash',
  });
  const [openingForm, setOpeningForm] = useState({
    opening_date: today,
    opening_cash: '0',
    opening_receivables: '0',
    opening_payables: '0',
    opening_equity: '0',
  });
  const [reportPeriod, setReportPeriod] = useState({
    from: `${today.slice(0, 7)}-01`,
    to: today,
  });
  const [recipe, setRecipe] = useState({
    id: '',
    name: '',
    batchSize: 10,
    soapWeight: 100,
    indirectIds: [],
    utensilIds: [],
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
      supabase.from('recipes').select('*, recipe_items(*), recipe_indirects(*), recipe_utensils(*)').order('name'),
      supabase.from('batches').select('*').order('created_at', { ascending: false }),
      supabase.from('sales').select('*, sale_items(*)').order('created_at', { ascending: false }),
      supabase.from('purchases').select('*, purchase_items(*)').order('purchase_date', { ascending: false }),
      supabase.from('expenses').select('*').order('expense_date', { ascending: false }),
      supabase.from('finance_settings').select('*').eq('id', 1).maybeSingle(),
      supabase.from('web_settings').select('*').eq('id', 1).maybeSingle(),
      supabase.from('web_products').select('*, batches(*)').order('sort_order').order('name'),
      supabase.from('web_orders').select('*, web_order_items(*)').order('created_at', { ascending: false }),
    ]);
    const failed = queries.find(({ error: queryError }) => queryError);
    if (failed) {
      setError(failed.error.message);
    } else {
      const [
        materials, indirects, utensils, recipes, batches, sales, purchases, expenses, financeSettings,
        webSettings, webProducts, webOrders,
      ] = queries.map((result) => result.data);
      setData({
        materials: materials.map(fromMaterial),
        indirects: indirects.map(fromIndirect),
        utensils: utensils.map(fromUtensil),
        recipes: recipes.map(fromRecipe),
        batches,
        sales,
        purchases,
        expenses,
        financeSettings,
        webSettings,
        webProducts,
        webOrders,
      });
      setWebSettingsDraft(webSettings || {
        id: 1,
        business_name: 'Fragancia & Miel',
        tagline: 'Jabones artesanales hechos con cuidado',
        logo_path: '',
        phone: '',
        whatsapp_phone: '',
        email: '',
        address: '',
        about_text: '',
      });
      if (financeSettings) {
        setOpeningForm({
          opening_date: financeSettings.opening_date,
          opening_cash: String(financeSettings.opening_cash),
          opening_receivables: String(financeSettings.opening_receivables),
          opening_payables: String(financeSettings.opening_payables),
          opening_equity: String(financeSettings.opening_equity),
        });
      }
    }
    setLoading(false);
  }, [session]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!session) return undefined;
    const channel = supabase
      .channel(`web-orders-${session.user.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'web_orders',
      }, (payload) => {
        toast(`¡Nuevo pedido web${payload.new?.order_number ? ` ${payload.new.order_number}` : ''}!`);
        loadData();
      })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          toast('No se pudo conectar con las notificaciones de pedidos web.', 'error');
        }
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [session, loadData, toast]);

  const metrics = useMemo(() => ({
    materials: data.materials.length,
    alerts: data.materials.filter((item) => item.initial + item.purchased - item.used <= item.min).length
      + data.indirects.filter((item) => item.stock <= item.minimumStock).length,
    recipes: data.recipes.length,
    batches: data.batches.length,
  }), [data]);
  const activeWebOrderCount = data.webOrders
    .filter((order) => ['pending', 'confirmed'].includes(order.status)).length;

  const soapStockRows = useMemo(() => data.webProducts.map((product) => {
    const batch = data.batches.find((item) => item.id === product.batch_id);
    return {
      product,
      batch,
      available: batch ? availableWebBatchStock(batch) : 0,
    };
  }), [data]);
  const soapStockTotal = useMemo(() => {
    const batches = new Map(
      soapStockRows.filter((row) => row.batch).map((row) => [row.batch.id, row.batch]),
    );
    return [...batches.values()].reduce((total, batch) => total + availableWebBatchStock(batch), 0);
  }, [data, soapStockRows]);

  const visibleMaterials = useMemo(() => {
    const query = materialSearch.trim().toLocaleLowerCase('es');
    return data.materials
      .filter((material) => !query || [material.code, material.name, material.unit]
        .some((value) => String(value).toLocaleLowerCase('es').includes(query)))
      .sort((a, b) => {
        const stockDifference = (b.initial + b.purchased - b.used) - (a.initial + a.purchased - a.used);
        return stockDifference || a.name.localeCompare(b.name, 'es');
      });
  }, [data.materials, materialSearch]);

  const costs = useMemo(() => {
    const batchSize = Math.max(1, number(recipe.batchSize));
    const materials = recipe.items.reduce((sum, item) => {
      const material = data.materials.find((entry) => entry.id === item.materialId);
      if (!material) return sum;
      return sum + material.unitCost * number(item.qty) * batchSize;
    }, 0);
    const indirectCost = recipe.indirectIds.reduce((sum, id) => {
      const indirect = data.indirects.find((item) => item.id === id);
      return sum + (indirect ? indirect.unitCost * indirect.consumptionPerSoap * batchSize : 0);
    }, 0);
    const utensilCost = recipe.utensilIds.reduce((sum, id) => {
      const utensil = data.utensils.find((item) => item.id === id);
      return sum + (utensil && utensil.life > 0 ? (utensil.cost / utensil.life) * batchSize : 0);
    }, 0);
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

  const reports = useMemo(() => {
    const withinPeriod = (date) => Boolean(date && date >= reportPeriod.from && date <= reportPeriod.to);
    const periodSales = data.sales.filter((sale) => sale.status === 'issued' && withinPeriod(sale.invoice_date));
    const periodRevenue = periodSales.reduce((sum, sale) => sum + number(sale.total), 0);
    const periodCost = periodSales.reduce((sum, sale) => sum
      + (sale.sale_items || []).reduce((itemSum, item) => itemSum + number(item.cost_total), 0), 0);
    const periodExpenses = data.expenses
      .filter((expense) => withinPeriod(expense.expense_date))
      .reduce((sum, expense) => sum + number(expense.amount), 0);
    const openingDate = data.financeSettings?.opening_date || today;
    const afterOpening = (date) => Boolean(date && date >= openingDate);
    const rawInventory = data.materials.reduce((sum, material) => {
      const acquired = material.initial + material.purchased;
      const remaining = Math.max(0, acquired - material.used);
      return sum + (acquired > 0 ? material.totalCost / acquired : 0) * remaining;
    }, 0);
    const indirectInventory = data.indirects.reduce((sum, item) => sum + item.stock * item.unitCost, 0);
    const totalProductionCost = data.batches.reduce((sum, batch) => sum + number(batch.total_cost), 0);
    const totalCostOfSales = data.sales
      .filter((sale) => sale.status === 'issued')
      .reduce((sum, sale) => sum + (sale.sale_items || [])
        .reduce((itemSum, item) => itemSum + number(item.cost_total), 0), 0);
    const finishedInventory = Math.max(0, totalProductionCost - totalCostOfSales);
    const settings = data.financeSettings || {};
    const cash = number(settings.opening_cash)
      + data.sales.filter((sale) => sale.status === 'issued' && sale.payment_status === 'paid'
        && afterOpening(sale.invoice_date) && afterOpening(sale.paid_at?.slice(0, 10)))
        .reduce((sum, sale) => sum + number(sale.total), 0)
      - data.purchases.filter((purchase) => purchase.payment_status === 'paid'
        && afterOpening(purchase.purchase_date) && afterOpening(purchase.paid_at?.slice(0, 10)))
        .reduce((sum, purchase) => sum + number(purchase.total), 0)
      - data.expenses.filter((expense) => expense.payment_status === 'paid'
        && afterOpening(expense.expense_date) && afterOpening(expense.paid_at?.slice(0, 10)))
        .reduce((sum, expense) => sum + number(expense.amount), 0);
    const receivables = number(settings.opening_receivables)
      + data.sales.filter((sale) => sale.status === 'issued' && sale.payment_status === 'pending'
        && afterOpening(sale.invoice_date))
        .reduce((sum, sale) => sum + number(sale.total), 0);
    const payables = number(settings.opening_payables)
      + data.purchases.filter((purchase) => purchase.payment_status === 'pending' && afterOpening(purchase.purchase_date))
        .reduce((sum, purchase) => sum + number(purchase.total), 0)
      + data.expenses.filter((expense) => expense.payment_status === 'pending' && afterOpening(expense.expense_date))
        .reduce((sum, expense) => sum + number(expense.amount), 0);
    const retainedEarnings = data.sales
      .filter((sale) => sale.status === 'issued' && afterOpening(sale.invoice_date))
      .reduce((sum, sale) => sum + number(sale.total)
        - (sale.sale_items || []).reduce((itemSum, item) => itemSum + number(item.cost_total), 0), 0)
      - data.expenses.filter((expense) => afterOpening(expense.expense_date))
        .reduce((sum, expense) => sum + number(expense.amount), 0);
    const assets = cash + receivables + rawInventory + indirectInventory + finishedInventory;
    const equity = number(settings.opening_equity) + retainedEarnings;
    return {
      revenue: periodRevenue,
      cost: periodCost,
      grossProfit: periodRevenue - periodCost,
      expenses: periodExpenses,
      netIncome: periodRevenue - periodCost - periodExpenses,
      cash,
      receivables,
      rawInventory,
      indirectInventory,
      finishedInventory,
      assets,
      payables,
      equity,
      liabilitiesAndEquity: payables + equity,
      difference: assets - payables - equity,
    };
  }, [data, reportPeriod]);

  function availableFinishedStock(recipeId) {
    const produced = data.batches
      .filter((batch) => batch.recipe_id === recipeId)
      .reduce((sum, batch) => sum + number(batch.quantity), 0);
    const sold = data.sales
      .filter((sale) => sale.status === 'issued')
      .flatMap((sale) => sale.sale_items || [])
      .filter((item) => item.recipe_id === recipeId)
      .reduce((sum, item) => sum + number(item.quantity), 0);
    const reserved = data.webOrders
      .filter((order) => order.status === 'confirmed')
      .flatMap((order) => order.web_order_items || [])
      .filter((item) => item.recipe_id === recipeId)
      .reduce((sum, item) => sum + number(item.quantity), 0);
    return produced - sold - reserved;
  }

  function availableWebBatchStock(batch) {
    const recipeBatches = data.batches
      .filter((item) => item.recipe_id === batch.recipe_id)
      .sort((a, b) => String(a.batch_date).localeCompare(String(b.batch_date))
        || String(a.created_at).localeCompare(String(b.created_at))
        || String(a.id).localeCompare(String(b.id)));
    const sold = data.sales
      .filter((sale) => sale.status === 'issued')
      .flatMap((sale) => sale.sale_items || [])
      .filter((item) => item.recipe_id === batch.recipe_id)
      .reduce((sum, item) => sum + number(item.quantity), 0);
    const reservedForBatch = data.webOrders
      .filter((order) => order.status === 'confirmed')
      .flatMap((order) => order.web_order_items || [])
      .filter((item) => item.batch_id === batch.id)
      .reduce((sum, item) => sum + number(item.quantity), 0);
    const earlierFree = recipeBatches
      .slice(0, recipeBatches.findIndex((item) => item.id === batch.id))
      .reduce((sum, item) => {
        const reserved = data.webOrders
          .filter((order) => order.status === 'confirmed')
          .flatMap((order) => order.web_order_items || [])
          .filter((orderItem) => orderItem.batch_id === item.id)
          .reduce((total, orderItem) => total + number(orderItem.quantity), 0);
        return sum + Math.max(0, number(item.quantity) - reserved);
      }, 0);
    const soldHere = Math.min(
      Math.max(0, number(batch.quantity) - reservedForBatch),
      Math.max(0, sold - earlierFree),
    );
    return Math.max(0, number(batch.quantity) - reservedForBatch - soldHere);
  }

  async function uploadWebImage(file, folder) {
    if (!file) return null;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) {
      throw new Error('Usa una imagen JPG, PNG o WebP de máximo 8 MB.');
    }
    const safeName = file.name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]/g, '-');
    const path = `${folder}/${crypto.randomUUID()}-${safeName}`;
    const { error: uploadError } = await supabase.storage.from('jabon').upload(path, file, {
      cacheControl: '3600',
      contentType: file.type,
      upsert: false,
    });
    if (uploadError) throw uploadError;
    return path;
  }

  function openWebProduct(product = null, duplicate = false) {
    setWebProductDraft(product ? {
      id: duplicate ? '' : product.id,
      name: duplicate ? `${product.name} (copia)` : product.name,
      batchId: product.batch_id || '',
      imagePath: product.image_path || '',
      benefits: (product.benefits || []).join('\n'),
      healthConcerns: (product.health_concerns || []).join(', '),
      composition: (product.composition || []).join('\n'),
      usageInstructions: product.usage_instructions || '',
      active: product.active,
      sortOrder: String(product.sort_order || 0),
    } : {
      id: '',
      name: '',
      batchId: '',
      imagePath: '',
      benefits: '',
      healthConcerns: '',
      composition: '',
      usageInstructions: '',
      active: true,
      sortOrder: '0',
    });
    setWebProductFile(null);
    setModal({ kind: 'webProduct' });
  }

  async function saveWebProduct(event) {
    event.preventDefault();
    if (!webProductDraft) return;
    let uploadedPath = null;
    try {
      uploadedPath = await uploadWebImage(webProductFile, 'products');
      const { error: saveError } = await supabase.from('web_products').upsert({
        id: webProductDraft.id || undefined,
        name: webProductDraft.name.trim(),
        batch_id: webProductDraft.batchId || null,
        image_path: uploadedPath || webProductDraft.imagePath || null,
        benefits: webProductDraft.benefits.split('\n').map((item) => item.trim()).filter(Boolean),
        health_concerns: webProductDraft.healthConcerns.split(/[,\n]/).map((item) => item.trim()).filter(Boolean),
        composition: webProductDraft.composition.split('\n').map((item) => item.trim()).filter(Boolean),
        usage_instructions: webProductDraft.usageInstructions.trim(),
        active: webProductDraft.active,
        sort_order: number(webProductDraft.sortOrder),
        updated_at: new Date().toISOString(),
      });
      if (saveError) {
        let reportedError = saveError.message;
        if (uploadedPath) {
          const { error: cleanupError } = await supabase.storage.from('jabon').remove([uploadedPath]);
          if (cleanupError) reportedError += ` No se pudo limpiar la imagen: ${cleanupError.message}`;
        }
        toast(reportedError, 'error');
        return;
      }
      setWebProductDraft(null);
      setWebProductFile(null);
      setModal(null);
      toast('Producto web guardado');
      await loadData();
    } catch (uploadError) {
      toast(uploadError.message || 'No se pudo subir la imagen.', 'error');
    }
  }

  async function deleteWebProduct(product) {
    if (!window.confirm(`¿Eliminar "${product.name}" del catálogo web?`)) return;
    const { error: deleteError } = await supabase.from('web_products').delete().eq('id', product.id);
    if (deleteError) {
      toast(deleteError.message, 'error');
      return;
    }
    toast('Producto eliminado del catálogo web');
    await loadData();
  }

  async function saveWebSettings(event) {
    event.preventDefault();
    if (!webSettingsDraft) return;
    let uploadedPath = null;
    try {
      uploadedPath = await uploadWebImage(webLogoFile, 'brand');
      const { error: saveError } = await supabase.from('web_settings').upsert({
        ...webSettingsDraft,
        logo_path: uploadedPath || webSettingsDraft.logo_path || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });
      if (saveError) {
        let reportedError = saveError.message;
        if (uploadedPath) {
          const { error: cleanupError } = await supabase.storage.from('jabon').remove([uploadedPath]);
          if (cleanupError) reportedError += ` No se pudo limpiar el logo: ${cleanupError.message}`;
        }
        toast(reportedError, 'error');
        return;
      }
      setWebLogoFile(null);
      toast('Configuración de la tienda guardada');
      await loadData();
    } catch (uploadError) {
      toast(uploadError.message || 'No se pudo subir el logo.', 'error');
    }
  }

  async function updateWebOrder(order, status) {
    const { error: orderError } = await supabase.rpc('manage_web_order', {
      p_order_id: order.id,
      p_status: status,
    });
    if (orderError) {
      toast(orderError.message, 'error');
      return;
    }
    toast(status === 'confirmed' ? 'Pedido reservado; el stock fue apartado.' : 'Pedido cancelado; el stock fue liberado.');
    await loadData();
  }

  async function deleteWebOrder(order) {
    const detail = order.status === 'confirmed'
      ? ' La reserva de inventario se liberará.'
      : order.status === 'completed'
        ? ' La venta registrada se conservará.'
        : '';
    if (!window.confirm(`¿Eliminar el pedido ${order.order_number}?${detail}`)) return;
    const { error: deleteError } = await supabase.rpc('delete_web_order', {
      p_order_id: order.id,
    });
    if (deleteError) {
      toast(deleteError.message, 'error');
      return;
    }
    toast('Pedido eliminado');
    await loadData();
  }

  async function completeWebOrder(event) {
    event.preventDefault();
    const order = modal?.order;
    if (!order) return;
    const form = new FormData(event.currentTarget);
    const { error: completeError } = await supabase.rpc('complete_web_order', {
      p_order_id: order.id,
      p_payment_method: form.get('paymentMethod'),
      p_payment_status: form.get('paymentStatus'),
    });
    if (completeError) {
      toast(completeError.message, 'error');
      return;
    }
    setModal(null);
    toast('Pedido convertido a venta; inventario actualizado');
    await loadData();
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
        ? {
          code: item.code,
          name: item.name,
          unit: item.unit,
          min: item.min,
          initial: item.initial,
          purchased: item.purchased,
          unitCost: item.unitCost || item.totalCost / Math.max(1, item.initial + item.purchased),
        }
        : { code: '', name: '', unit: 'g', min: '', initial: 0, purchased: 0, unitCost: '' },
      indirects: item
        ? {
          code: item.code,
          name: item.name,
          type: item.type,
          measureUnit: item.measureUnit,
          stock: item.stock,
          minimumStock: item.minimumStock,
          consumptionPerSoap: item.consumptionPerSoap,
          cost: item.cost,
          yieldVal: item.yieldVal,
          unitCost: item.unitCost,
        }
        : {
          code: '',
          name: '',
          type: 'Envase / Botella',
          measureUnit: 'g',
          stock: 0,
          minimumStock: 0,
          consumptionPerSoap: 1,
          cost: 0,
          yieldVal: 1,
          unitCost: 0,
        },
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
        unit_cost: number(values.unitCost),
        total_cost: number(values.unitCost) * (number(values.initial) + number(values.purchased)),
      },
      indirects: {
        ...common,
        type: values.type,
        measure_unit: values.measureUnit,
        stock: number(values.stock),
        minimum_stock: number(values.minimumStock),
        consumption_per_soap: number(values.consumptionPerSoap),
        cost: item?.cost ?? number(values.cost),
        yield_value: item?.yieldVal ?? 1,
        unit_cost: item?.unitCost ?? number(values.unitCost),
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

  async function deleteBatch(batch) {
    if (!window.confirm(`¿Eliminar el lote ${batch.code}? Los pedidos activos relacionados se cancelarán; el historial se conservará y los productos web quedarán sin lote asignado.`)) return;
    const { data: cancelledOrders, error: deleteError } = await supabase.rpc('delete_batch', {
      p_batch_id: batch.id,
    });
    if (deleteError) {
      toast(deleteError.message, 'error');
      return;
    }
    const count = Number(cancelledOrders || 0);
    toast(`Lote eliminado; ${count} pedido${count === 1 ? '' : 's'} activo${count === 1 ? '' : 's'} cancelado${count === 1 ? '' : 's'}. El historial se conservó.`);
    await loadData();
  }

  function editRecipe(item) {
    setRecipe({
      id: item.id,
      name: item.name,
      batchSize: item.batchSize,
      soapWeight: item.soapWeight,
      indirectIds: item.indirectIds,
      utensilIds: item.utensilIds,
      margin: item.margin ?? 100,
      prices: item.prices,
      items: item.items.length ? item.items.map((row) => ({ ...row })) : [{ materialId: '', qty: '' }],
    });
    setTab('recipes');
  }

  function duplicateRecipe(item) {
    const baseName = `${item.name} (copia)`;
    let copyName = baseName;
    let copyNumber = 2;
    while (data.recipes.some((recipeItem) => recipeItem.name.toLocaleLowerCase('es') === copyName.toLocaleLowerCase('es'))) {
      copyName = `${baseName} ${copyNumber}`;
      copyNumber += 1;
    }
    setRecipe({
      id: '',
      name: copyName,
      batchSize: item.batchSize,
      soapWeight: item.soapWeight,
      indirectIds: [...item.indirectIds],
      utensilIds: [...item.utensilIds],
      margin: item.margin ?? 100,
      prices: { ...item.prices },
      items: item.items.length ? item.items.map((row) => ({ ...row })) : [{ materialId: '', qty: '' }],
    });
    setTab('recipes');
  }

  function createRecipe() {
    setRecipe({
      id: '',
      name: '',
      batchSize: 10,
      soapWeight: 100,
      indirectIds: [],
      utensilIds: [],
      margin: 100,
      prices: { detail: null, wholesale: null, event: null },
      items: [{ materialId: '', qty: '' }],
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
      p_margin: number(recipe.margin),
      p_price_detail: number(salePrices.detail),
      p_price_wholesale: number(salePrices.wholesale),
      p_price_event: number(salePrices.event),
      p_items: items,
      p_indirects: recipe.indirectIds.filter(Boolean).map((indirect_id) => ({ indirect_id })),
      p_utensils: recipe.utensilIds.filter(Boolean).map((utensil_id) => ({ utensil_id })),
    });
    if (saveError) {
      toast(saveError.message, 'error');
      return;
    }
    setRecipe({
      id: '', name: '', batchSize: 10, soapWeight: 100, indirectIds: [], utensilIds: [], margin: 100,
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
        paymentStatus: sale.payment_status,
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
        paymentStatus: 'paid',
        items: [{ recipeId: '', quantity: '1', priceType: 'detail' }],
      });
    setModal({ kind: 'sale' });
  }

  function openPurchaseForm(purchase = null) {
    setPurchaseDraft(purchase ? {
      id: purchase.id,
      supplierName: purchase.supplier_name === 'Proveedor general' ? '' : purchase.supplier_name,
      purchaseDate: purchase.purchase_date,
      paymentStatus: purchase.payment_status,
      paymentMethod: purchase.payment_method,
      items: (purchase.purchase_items || []).map((item) => ({
        itemType: item.item_type || 'materials',
        itemId: item.material_id || item.indirect_id || item.utensil_id || '',
        quantity: String(item.quantity),
        unitCost: String(item.unit_cost),
      })),
    } : {
      id: '',
      supplierName: '',
      purchaseDate: today,
      paymentStatus: 'paid',
      paymentMethod: 'cash',
      items: [{ itemType: 'materials', itemId: '', quantity: '', unitCost: '' }],
    });
    setModal({ kind: 'purchase' });
  }

  async function savePurchase(event) {
    event.preventDefault();
    const items = purchaseDraft.items
      .filter((item) => item.itemId)
      .map((item) => ({
        item_type: item.itemType,
        material_id: item.itemType === 'materials' ? item.itemId : null,
        indirect_id: item.itemType === 'indirects' ? item.itemId : null,
        utensil_id: item.itemType === 'utensils' ? item.itemId : null,
        quantity: number(item.quantity),
        unit_cost: number(item.unitCost),
      }));
    if (!items.length || items.some((item) => item.quantity <= 0 || item.unit_cost < 0)) {
      toast('Agrega materias primas, cantidades y costos válidos.', 'error');
      return;
    }

    const { error: purchaseError } = await supabase.rpc(purchaseDraft.id ? 'update_purchase' : 'record_purchase', {
      ...(purchaseDraft.id ? { p_purchase_id: purchaseDraft.id, p_delete: false } : {}),
      p_supplier_name: purchaseDraft.supplierName.trim() || null,
      p_purchase_date: purchaseDraft.purchaseDate,
      p_payment_status: purchaseDraft.paymentStatus,
      p_payment_method: purchaseDraft.paymentMethod,
      p_items: items,
    });
    if (purchaseError) {
      toast(purchaseError.message, 'error');
      return;
    }
    setModal(null);
    setPurchaseDraft(null);
    toast(purchaseDraft.id ? 'Compra actualizada y stock ajustado' : 'Compra registrada y stock actualizado');
    await loadData();
  }

  async function deletePurchase(purchase) {
    if (!window.confirm(`¿Eliminar la compra ${purchase.purchase_number}? El inventario se ajustará; no se podrá eliminar si los artículos ya fueron consumidos.`)) return;
    const { error: purchaseError } = await supabase.rpc('update_purchase', {
      p_purchase_id: purchase.id,
      p_supplier_name: purchase.supplier_name,
      p_purchase_date: purchase.purchase_date,
      p_payment_status: purchase.payment_status,
      p_payment_method: purchase.payment_method,
      p_items: [],
      p_delete: true,
    });
    if (purchaseError) {
      toast(purchaseError.message, 'error');
      return;
    }
    setModal(null);
    toast('Compra eliminada y stock ajustado');
    await loadData();
  }

  async function markAsPaid(kind, row) {
    const rpc = {
      sales: ['mark_sale_paid', 'p_sale_id'],
      purchases: ['mark_purchase_paid', 'p_purchase_id'],
      expenses: ['mark_expense_paid', 'p_expense_id'],
    }[kind];
    const { error: paymentError } = await supabase.rpc(rpc[0], {
      [rpc[1]]: row.id,
      p_payment_method: row.payment_method,
    });
    if (paymentError) {
      toast(paymentError.message, 'error');
      return;
    }
    toast('Pago registrado');
    await loadData();
  }

  async function saveExpense(event) {
    event.preventDefault();
    const { error: expenseError } = await supabase.rpc('record_expense', {
      p_description: expenseForm.description.trim(),
      p_category: expenseForm.category.trim(),
      p_amount: number(expenseForm.amount),
      p_expense_date: expenseForm.expenseDate,
      p_payment_status: expenseForm.paymentStatus,
      p_payment_method: expenseForm.paymentMethod,
    });
    if (expenseError) {
      toast(expenseError.message, 'error');
      return;
    }
    setExpenseForm({
      description: '',
      category: '',
      amount: '',
      expenseDate: today,
      paymentStatus: 'paid',
      paymentMethod: 'cash',
    });
    toast('Gasto registrado');
    await loadData();
  }

  async function saveOpeningBalances(event) {
    event.preventDefault();
    const { error: settingsError } = await supabase.from('finance_settings').upsert({
      id: 1,
      opening_date: openingForm.opening_date,
      opening_cash: number(openingForm.opening_cash),
      opening_receivables: number(openingForm.opening_receivables),
      opening_payables: number(openingForm.opening_payables),
      opening_equity: number(openingForm.opening_equity),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
    if (settingsError) {
      toast(settingsError.message, 'error');
      return;
    }
    toast('Saldos iniciales guardados');
    await loadData();
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
      toast('Agrega productos y cantidades válidas a la venta.', 'error');
      return;
    }

    const { error: saveError } = await supabase.rpc('save_sales_order', {
      p_sale_id: saleDraft.id || null,
      p_customer_name: saleDraft.customerName.trim() || null,
      p_customer_phone: saleDraft.customerPhone.trim() || null,
      p_payment_method: saleDraft.paymentMethod,
      p_payment_status: saleDraft.paymentStatus,
      p_items: items,
    });
    if (saveError) {
      toast(saveError.message, 'error');
      return;
    }
    setModal(null);
    setSaleDraft(null);
    toast('Venta guardada en borrador');
    await loadData();
  }

  async function issueSalesOrder(sale) {
    if (!window.confirm('¿Emitir la factura? Se validará y descontará el stock de jabones terminados.')) return;
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
      const optionalCategories = ['sales', 'purchases', 'expenses'];
      if (!backup || categories.some((category) => !Array.isArray(backup[category]))
        || optionalCategories.some((category) => backup[category] !== undefined && !Array.isArray(backup[category]))) {
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
          unit_cost: number(row.unit_cost ?? row.unitCost
            ?? number(row.total_cost ?? row.totalCost) / Math.max(1, number(row.initial_stock ?? row.initial) + number(row.purchased))),
        })),
        indirects: backup.indirects.map((row) => ({
          owner_id: session.user.id,
          code: row.code,
          name: row.name,
          type: row.type,
          cost: number(row.cost),
          yield_value: number(row.yield_value ?? row.yieldVal),
          measure_unit: row.measure_unit ?? row.measureUnit ?? 'pza',
          stock: number(row.stock ?? row.yield_value ?? row.yieldVal),
          minimum_stock: number(row.minimum_stock ?? row.minimumStock),
          consumption_per_soap: number(row.consumption_per_soap ?? row.consumptionPerSoap ?? 1),
          unit_cost: row.unit_cost != null || row.unitCost != null
            ? number(row.unit_cost ?? row.unitCost)
            : number(row.cost) / Math.max(1, number(row.yield_value ?? row.yieldVal)),
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
        const indirects = (row.indirectIds || (row.recipe_indirects?.length
          ? row.recipe_indirects.map((item) => item.indirect_id)
          : [row.indirect_id || row.indirectId].filter(Boolean)))
          .map((id) => {
            const indirectId = idMaps.indirects.get(id);
            if (!indirectId) throw new Error(`No se encontró un insumo indirecto de la receta "${row.name}".`);
            return { indirect_id: indirectId };
          });
        const utensils = (row.utensilIds || (row.recipe_utensils?.length
          ? row.recipe_utensils.map((item) => item.utensil_id)
          : [row.utensil_id || row.utId].filter(Boolean)))
          .map((id) => {
            const utensilId = idMaps.utensils.get(id);
            if (!utensilId) throw new Error(`No se encontró un utensilio de la receta "${row.name}".`);
            return { utensil_id: utensilId };
          });
        const { data: savedId, error: importError } = await supabase.rpc('save_recipe', {
          p_recipe_id: recipeNames.get(row.name) || null,
          p_name: row.name,
          p_batch_size: number(row.batch_size ?? row.batchSize),
          p_soap_weight: number(row.soap_weight ?? row.soapWeight),
          p_margin: number(row.margin ?? 100),
          p_price_detail: row.price_detail ?? row.prices?.detail ?? null,
          p_price_wholesale: row.price_wholesale ?? row.prices?.wholesale ?? null,
          p_price_event: row.price_event ?? row.prices?.event ?? null,
          p_items: ingredients,
          p_indirects: indirects,
          p_utensils: utensils,
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

      for (const purchase of backup.purchases || []) {
        const { data: savedPurchase, error: purchaseError } = await supabase
          .from('purchases')
          .upsert({
            id: purchase.id,
            owner_id: session.user.id,
            purchase_number: purchase.purchase_number,
            supplier_name: purchase.supplier_name,
            purchase_date: purchase.purchase_date,
            payment_status: purchase.payment_status,
            payment_method: purchase.payment_method,
            total: number(purchase.total),
            paid_at: purchase.paid_at,
            created_at: purchase.created_at,
          }, { onConflict: 'id' })
          .select('id')
          .single();
        if (purchaseError) throw purchaseError;
        const items = (purchase.purchase_items || []).map((item) => {
          const itemType = item.item_type || 'materials';
          const ids = idMaps[itemType];
          const sourceId = item.material_id || item.indirect_id || item.utensil_id;
          const itemId = ids?.get(sourceId);
          if (!itemId) throw new Error(`No se encontró "${item.item_name || item.material_name}" de la compra.`);
          const sourceItem = backup[itemType]?.find((row) => row.id === sourceId);
          return {
            id: item.id,
            purchase_id: savedPurchase.id,
            item_type: itemType,
            material_id: itemType === 'materials' ? itemId : null,
            indirect_id: itemType === 'indirects' ? itemId : null,
            utensil_id: itemType === 'utensils' ? itemId : null,
            item_name: item.item_name || item.material_name,
            material_name: itemType === 'materials' ? item.item_name || item.material_name : null,
            quantity: number(item.quantity),
            unit_label: item.unit_label || sourceItem?.unit || sourceItem?.measure_unit || sourceItem?.measureUnit
              || (itemType === 'utensils' ? 'uso' : 'unidad'),
            unit_cost: number(item.unit_cost),
            line_total: number(item.line_total),
            created_at: item.created_at,
          };
        });
        const { error: deleteItemsError } = await supabase.from('purchase_items').delete().eq('purchase_id', savedPurchase.id);
        if (deleteItemsError) throw deleteItemsError;
        if (items.length) {
          const { error: itemError } = await supabase.from('purchase_items').insert(items);
          if (itemError) throw itemError;
        }
      }

      for (const sale of backup.sales || []) {
        const status = sale.status === 'issued' ? 'issued' : 'draft';
        if (status === 'issued' && (!sale.invoice_number || !sale.invoice_date)) {
          throw new Error('Una venta emitida del respaldo no tiene número o fecha de comprobante.');
        }
        const { data: savedSale, error: saleError } = await supabase
          .from('sales')
          .upsert({
            id: sale.id,
            owner_id: session.user.id,
            status,
            invoice_number: status === 'issued' ? sale.invoice_number : null,
            invoice_date: status === 'issued' ? sale.invoice_date : null,
            customer_name: sale.customer_name || 'Cliente general',
            customer_phone: sale.customer_phone || null,
            payment_method: sale.payment_method || 'cash',
            payment_status: sale.payment_status || 'paid',
            paid_at: sale.paid_at || (status === 'issued' && sale.payment_status !== 'pending' ? sale.issued_at : null),
            subtotal: number(sale.subtotal),
            total: number(sale.total),
            created_at: sale.created_at,
            issued_at: status === 'issued' ? sale.issued_at || `${sale.invoice_date}T12:00:00Z` : null,
          }, { onConflict: 'id' })
          .select('id')
          .single();
        if (saleError) throw saleError;
        const items = (sale.sale_items || []).map((item) => {
          const recipeId = idMaps.recipes.get(item.recipe_id)
            || recipeNames.get(item.recipe_name)
            || data.recipes.find((recipeItem) => recipeItem.id === item.recipe_id)?.id;
          if (!recipeId) throw new Error(`No se encontró la receta "${item.recipe_name}" de la venta.`);
          const production = batches.filter((batch) => batch.recipe_id === recipeId);
          const producedQuantity = production.reduce((sum, batch) => sum + number(batch.quantity), 0);
          const estimatedUnitCost = producedQuantity
            ? production.reduce((sum, batch) => sum + number(batch.total_cost), 0) / producedQuantity
            : 0;
          const unitCost = item.unit_cost == null ? estimatedUnitCost : number(item.unit_cost);
          return {
            id: item.id,
            sale_id: savedSale.id,
            recipe_id: recipeId,
            recipe_name: item.recipe_name,
            quantity: number(item.quantity),
            price_type: item.price_type,
            unit_price: number(item.unit_price),
            line_total: number(item.line_total),
            unit_cost: unitCost,
            cost_total: item.cost_total == null ? Math.round(unitCost * number(item.quantity) * 100) / 100 : number(item.cost_total),
            cost_recorded: item.cost_recorded == null ? status === 'issued' && producedQuantity > 0 : Boolean(item.cost_recorded),
            created_at: item.created_at,
          };
        });
        const { error: deleteItemsError } = await supabase.from('sale_items').delete().eq('sale_id', savedSale.id);
        if (deleteItemsError) throw deleteItemsError;
        if (items.length) {
          const { error: itemError } = await supabase.from('sale_items').insert(items);
          if (itemError) throw itemError;
        }
      }

      for (const expense of backup.expenses || []) {
        const { error: expenseError } = await supabase.from('expenses').upsert({
          id: expense.id,
          owner_id: session.user.id,
          description: expense.description,
          category: expense.category,
          amount: number(expense.amount),
          expense_date: expense.expense_date,
          payment_status: expense.payment_status,
          payment_method: expense.payment_method,
          paid_at: expense.paid_at,
          created_at: expense.created_at,
        }, { onConflict: 'id' });
        if (expenseError) throw expenseError;
      }

      if (backup.financeSettings) {
        const { error: settingsError } = await supabase.from('finance_settings').upsert({
          ...backup.financeSettings,
          id: 1,
        }, { onConflict: 'id' });
        if (settingsError) throw settingsError;
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
          <button
            type="button"
            className="menu-toggle"
            aria-label={mobileNavOpen ? 'Cerrar menú de navegación' : 'Abrir menú de navegación'}
            aria-expanded={mobileNavOpen}
            aria-controls="primary-navigation"
            onClick={() => setMobileNavOpen(!mobileNavOpen)}
          >☰</button>
          <span className="currency-label">LPS <span>· Lempiras</span></span>
          <button className="button ghost" onClick={exportData}>↓ <span>Exportar</span></button>
          <button className="button ghost" onClick={() => document.getElementById('import-backup').click()}>↑ <span>Importar</span></button>
          <input id="import-backup" className="file-input" type="file" accept="application/json,.json" onChange={importData} />
          <button className="button ghost" onClick={lockApp}>Salir</button>
        </div>
      </header>

      <div className="app-workspace">
        {mobileNavOpen && <button type="button" className="sidebar-backdrop" aria-label="Cerrar menú" onClick={() => setMobileNavOpen(false)} />}
        <aside id="primary-navigation" className={`sidebar${mobileNavOpen ? ' open' : ''}`} aria-label="Navegación principal">
          {navigationGroups.map((group) => (
            <section className="nav-group" key={group.label}>
              <h2>{group.label}</h2>
              {group.items.map(([id, title, icon]) => (
                <button
                  type="button"
                  key={id}
                  className={`nav-item${tab === id ? ' active' : ''}`}
                  aria-current={tab === id ? 'page' : undefined}
                  onClick={() => {
                    setTab(id);
                    setMobileNavOpen(false);
                  }}
                >
                  <span className="nav-icon">{icon}</span><span>{title}</span>
                  {id === 'webOrders' && activeWebOrderCount > 0 && (
                    <span className="nav-badge" aria-label={`${activeWebOrderCount} pedidos por gestionar`} aria-live="polite">
                      {activeWebOrderCount > 99 ? '99+' : activeWebOrderCount}
                    </span>
                  )}
                </button>
              ))}
            </section>
          ))}
        </aside>

      <main className="main-content">
        <div className="welcome-row">
          <div><p className="eyebrow">PANEL DE CONTROL</p><h1>Tu taller, en orden.</h1><p className="muted">Inventario, recetas y producción en un solo lugar.</p></div>
          <button className="button primary" onClick={() => { setModal({ kind: 'production' }); }}>＋ Registrar producción</button>
        </div>

        {error && <Notice type="error">{error}</Notice>}
        <section className="metrics-grid">
          <Metric label="Materias primas" value={metrics.materials} detail="Insumos registrados" icon="◈" />
          <Metric label="Stock bajo" value={metrics.alerts} detail="Materias primas e indirectos" icon="⚠" warning={metrics.alerts > 0} />
          <Metric label="Recetas" value={metrics.recipes} detail="Fichas técnicas" icon="⌗" />
          <Metric label="Lotes producidos" value={metrics.batches} detail="Producciones registradas" icon="▤" />
        </section>

        {loading && <div className="loading-inline">Sincronizando datos con Supabase…</div>}
        {tab === 'soapStock' && (
          <Section title="Stock de jabones" subtitle="Existencias disponibles por nombre de producto web, con detalle por lote">
            <div className="stock-total">
              <span>Total disponible en productos web <small>(cada lote se cuenta una sola vez)</small></span>
              <strong>{soapStockTotal} jabones</strong>
            </div>
            <Table headers={['Producto web', 'Receta', 'Lote', 'Fecha de producción', 'Producidos', 'Disponibles', 'Estado']}>
              {soapStockRows.map(({ product, batch, available }) => (
                <tr key={product.id}>
                  <td className="strong">{product.name}</td>
                  <td>{batch?.recipe_name || '—'}</td>
                  <td><code>{batch?.code || 'Sin lote'}</code></td>
                  <td>{batch ? new Date(`${batch.batch_date}T12:00:00`).toLocaleDateString('es-HN') : '—'}</td>
                  <td>{batch?.quantity ?? 0}</td>
                  <td className="green">{available}</td>
                  <td><span className={`pill ${batch ? 'good' : 'warning'}`}>{batch ? 'Con lote' : 'Sin lote asignado'}</span></td>
                </tr>
              ))}
            </Table>
          </Section>
        )}
        {tab === 'materials' && (
          <Section title="Inventario de materia prima directa" subtitle="Controla existencias, compras y alertas de reposición" action="＋ Nueva materia prima" onAction={() => openEntity('materials')}>
            <div className="inventory-toolbar">
              <label className="inventory-search">
                <span>Buscar materia prima</span>
                <input
                  type="search"
                  value={materialSearch}
                  onChange={(event) => setMaterialSearch(event.target.value)}
                  placeholder="Buscar por código, nombre o unidad…"
                />
              </label>
              <span className="inventory-count">{visibleMaterials.length} de {data.materials.length} insumos · ordenados por stock</span>
            </div>
            <Table headers={['Código', 'Insumo', 'Unidad', 'Stock inicial', 'Compras', 'Usado', 'Stock actual', 'Mínimo', 'Costo compra total', 'Costo unitario', 'Estado', '']}>
              {visibleMaterials.map((item) => {
                const stock = item.initial + item.purchased - item.used;
                const low = stock <= item.min;
                return <tr key={item.id}>
                  <td><code>{item.code}</code></td><td className="strong">{item.name}</td><td>{item.unit}</td>
                  <td>{item.initial}</td><td>{item.purchased}</td><td>{item.used.toFixed(2)}</td><td className="strong">{stock.toFixed(2)}</td><td>{item.min}</td>
                  <td>{money(item.totalCost)}</td><td className="green">{unitMoney(item.unitCost)}</td>
                  <td><span className={`pill ${low ? 'danger' : 'good'}`}>{low ? 'Reordenar' : 'Óptimo'}</span></td>
                  <Actions onEdit={() => openEntity('materials', item)} onDelete={() => deleteRow('materials', item.id, 'esta materia prima')} />
                </tr>;
              })}
            </Table>
          </Section>
        )}
        {tab === 'indirects' && (
          <Section title="Insumos indirectos" subtitle="Controla unidades, existencias, consumo por jabón y reposición" action="＋ Nuevo insumo indirecto" onAction={() => openEntity('indirects')}>
            <Table headers={['Código', 'Nombre', 'Tipo', 'Unidad', 'Stock actual', 'Mínimo', 'Consumo por jabón', 'Rinde aprox.', 'Costo por unidad', 'Estado', '']}>
              {data.indirects.map((item) => {
                const low = item.stock <= item.minimumStock;
                return <tr key={item.id}>
                  <td><code>{item.code}</code></td><td className="strong">{item.name}</td><td>{item.type}</td>
                  <td>{item.measureUnit}</td><td className="strong">{item.stock.toFixed(3)}</td><td>{item.minimumStock}</td>
                  <td>{item.consumptionPerSoap} {item.measureUnit} / jabón</td>
                  <td>{Math.floor(item.stock / item.consumptionPerSoap)} jabones</td><td className="green">{unitMoney(item.unitCost)} / {item.measureUnit}</td>
                  <td><span className={`pill ${low ? 'danger' : 'good'}`}>{low ? 'Reabastecer' : 'Óptimo'}</span></td>
                  <Actions onEdit={() => openEntity('indirects', item)} onDelete={() => deleteRow('indirects', item.id, 'este insumo indirecto')} />
                </tr>;
              })}
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
                <div className="list-heading"><h3>Materia prima por jabón</h3><button type="button" className="text-button" onClick={() => setRecipe({ ...recipe, items: [...recipe.items, { materialId: '', qty: '' }] })}>＋ Agregar ingrediente</button></div>
                {recipe.items.map((item, index) => {
                  const material = data.materials.find((entry) => entry.id === item.materialId);
                  const unitCost = material?.unitCost || 0;
                  return (
                    <div className="ingredient-row" key={index}>
                      <select aria-label="Materia prima" value={item.materialId} onChange={(event) => setRecipe({ ...recipe, items: recipe.items.map((row, i) => i === index ? { ...row, materialId: event.target.value } : row) })}>
                        <option value="">Selecciona un insumo</option>
                        {data.materials.map((material) => <option key={material.id} value={material.id}>{material.name} ({material.unit})</option>)}
                      </select>
                      <input type="number" min="0" step="any" placeholder="Cantidad" aria-label="Cantidad" value={item.qty} onChange={(event) => setRecipe({ ...recipe, items: recipe.items.map((row, i) => i === index ? { ...row, qty: event.target.value } : row) })} />
                      <button type="button" className="icon-button danger-text" aria-label="Quitar ingrediente" onClick={() => setRecipe({ ...recipe, items: recipe.items.filter((_, i) => i !== index) })}>×</button>
                      <div className="ingredient-cost">
                        {material ? `Costo unitario: ${unitMoney(unitCost)} / ${material.unit} · Subtotal por jabón: ${money(unitCost * number(item.qty))}` : 'Selecciona la materia prima para calcular su costo.'}
                      </div>
                    </div>
                  );
                })}
                <div className="list-heading">
                  <h3>Insumos indirectos</h3>
                  <button type="button" className="text-button" onClick={() => setRecipe({ ...recipe, indirectIds: [...recipe.indirectIds, ''] })}>＋ Agregar insumo</button>
                </div>
                {recipe.indirectIds.map((id, index) => {
                  const indirect = data.indirects.find((item) => item.id === id);
                  const cost = indirect
                    ? indirect.unitCost * indirect.consumptionPerSoap * number(recipe.batchSize) : 0;
                  return (
                    <div className="resource-item-row" key={`indirect-${index}`}>
                      <select aria-label="Insumo indirecto" value={id} onChange={(event) => setRecipe({
                        ...recipe,
                        indirectIds: recipe.indirectIds.map((row, rowIndex) => rowIndex === index ? event.target.value : row),
                      })}>
                        <option value="">Selecciona un insumo</option>
                        {data.indirects.filter((item) => !recipe.indirectIds.includes(item.id) || item.id === id)
                          .map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                      </select>
                      <button type="button" className="icon-button danger-text" aria-label="Quitar insumo indirecto" onClick={() => setRecipe({
                        ...recipe, indirectIds: recipe.indirectIds.filter((_, rowIndex) => rowIndex !== index),
                      })}>×</button>
                      <div className="resource-item-cost">{indirect ? `Consumo: ${indirect.consumptionPerSoap} ${indirect.measureUnit} por jabón · Costo del lote: ${money(cost)}` : 'Selecciona un insumo indirecto.'}</div>
                    </div>
                  );
                })}
                <div className="list-heading">
                  <h3>Utensilios y moldes</h3>
                  <button type="button" className="text-button" onClick={() => setRecipe({ ...recipe, utensilIds: [...recipe.utensilIds, ''] })}>＋ Agregar utensilio</button>
                </div>
                {recipe.utensilIds.map((id, index) => {
                  const utensil = data.utensils.find((item) => item.id === id);
                  const cost = utensil && utensil.life > 0
                    ? (utensil.cost / utensil.life) * number(recipe.batchSize) : 0;
                  return (
                    <div className="resource-item-row" key={`utensil-${index}`}>
                      <select aria-label="Utensilio o molde" value={id} onChange={(event) => setRecipe({
                        ...recipe,
                        utensilIds: recipe.utensilIds.map((row, rowIndex) => rowIndex === index ? event.target.value : row),
                      })}>
                        <option value="">Selecciona un utensilio</option>
                        {data.utensils.filter((item) => !recipe.utensilIds.includes(item.id) || item.id === id)
                          .map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                      </select>
                      <button type="button" className="icon-button danger-text" aria-label="Quitar utensilio" onClick={() => setRecipe({
                        ...recipe, utensilIds: recipe.utensilIds.filter((_, rowIndex) => rowIndex !== index),
                      })}>×</button>
                      <div className="resource-item-cost">{utensil ? `Depreciación para este lote: ${money(cost)}` : 'Selecciona un utensilio.'}</div>
                    </div>
                  );
                })}
                <button className="button primary wide">{recipe.id ? 'Guardar cambios' : 'Guardar receta'}</button>
                {recipe.id && <button type="button" className="button secondary wide" onClick={() => setRecipe({ id: '', name: '', batchSize: 10, soapWeight: 100, indirectIds: [], utensilIds: [], margin: 100, prices: { detail: null, wholesale: null, event: null }, items: [{ materialId: '', qty: '' }] })}>Cancelar edición</button>}
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
            </div>
          </div>
        )}
        {tab === 'savedRecipes' && (
          <Section
            title="Recetas guardadas"
            subtitle={`${data.recipes.length} fichas técnicas disponibles`}
            action="＋ Nueva receta"
            onAction={createRecipe}
          >
            <div className="saved-recipes">
              {data.recipes.map((item) => <div className="saved-recipe" key={item.id}>
                <button className="recipe-name" onClick={() => editRecipe(item)}><strong>{item.name}</strong><small>{item.batchSize} barras · {item.soapWeight} g c/u</small></button>
                <button className="icon-button" aria-label={`Duplicar ${item.name}`} title="Duplicar receta" onClick={() => duplicateRecipe(item)}>⧉</button>
                <button className="icon-button danger-text" aria-label={`Eliminar ${item.name}`} onClick={() => deleteRow('recipes', item.id, 'esta receta')}>×</button>
              </div>)}
              {data.recipes.length === 0 && <Empty text="Guarda tu primera receta para verla aquí." />}
            </div>
          </Section>
        )}
        {tab === 'production' && (
          <Section title="Historial de producción" subtitle="Lotes registrados y costos reales" action="＋ Registrar producción" onAction={() => setModal({ kind: 'production' })}>
            <Table headers={['Fecha', 'Código de lote', 'Receta', 'Cantidad', 'Costo total', 'Costo por barra', '']}>
              {data.batches.map((batch) => <tr key={batch.id}>
                <td>{new Date(`${batch.batch_date}T12:00:00`).toLocaleDateString('es-HN')}</td>
                <td><code>{batch.code}</code></td><td className="strong">{batch.recipe_name}</td><td>{batch.quantity} jabones</td>
                <td>{money(batch.total_cost)}</td><td className="green">{money(batch.unit_cost)}</td>
                <Actions onDelete={() => deleteBatch(batch)} />
              </tr>)}
            </Table>
          </Section>
        )}
        {tab === 'sales' && (
          <div className="sales-page">
            <Section title="Facturar una venta" subtitle="Crea una venta y emite su comprobante cuando esté lista" action="＋ Crear venta" onAction={() => openSalesOrder()}>
              <div className="sales-intro">
                <span className="sales-intro-icon">▧</span>
                <p>Registra los productos y el pago. La venta quedará como borrador hasta que la emitas; al emitirla se valida el inventario de jabones terminados.</p>
              </div>
            </Section>
            <Section title="Registro de ventas" subtitle={`${data.sales.length} ventas y borradores registrados`}>
              <Table headers={['N.º / venta', 'Fecha', 'Cliente', 'Unidades', 'Total', 'Estado', 'Acciones']}>
                {data.sales.map((sale) => (
                  <tr key={sale.id}>
                    <td><code>{sale.invoice_number || `VTA-${sale.id.slice(0, 8).toUpperCase()}`}</code></td>
                    <td>{new Date(`${sale.invoice_date || sale.created_at.slice(0, 10)}T12:00:00`).toLocaleDateString('es-HN')}</td>
                    <td className="strong">{sale.customer_name}</td>
                    <td>{(sale.sale_items || []).reduce((sum, item) => sum + number(item.quantity), 0)}</td>
                    <td className="green">{money(sale.total)}</td>
                    <td><span className={`pill ${sale.status === 'issued' && sale.payment_status === 'paid' ? 'good' : 'warning'}`}>
                      {sale.status === 'draft' ? 'Borrador' : sale.payment_status === 'paid' ? 'Facturado · pagado' : 'Facturado · por cobrar'}
                    </span></td>
                    <td className="sale-actions">
                      {sale.status === 'draft'
                        ? <>
                          <button className="icon-button" aria-label="Editar venta" title="Editar venta" onClick={() => openSalesOrder(sale)}>✎</button>
                          <button className="button primary small" onClick={() => issueSalesOrder(sale)}>Emitir factura</button>
                        </>
                        : <>
                          <button className="button secondary small" onClick={() => setModal({ kind: 'invoice', sale })}>Ver / imprimir</button>
                          {sale.payment_status === 'pending' && <button className="button primary small" onClick={() => markAsPaid('sales', sale)}>Marcar pagada</button>}
                        </>}
                    </td>
                  </tr>
                ))}
              </Table>
            </Section>
          </div>
        )}
        {tab === 'purchases' && (
          <Section title="Compras e insumos" subtitle="Registra compras de materia prima, insumos indirectos y utensilios" action="＋ Registrar compra" onAction={openPurchaseForm}>
            <Table headers={['N.º compra', 'Fecha', 'Proveedor', 'Insumos', 'Total', 'Pago', 'Acciones']}>
              {data.purchases.map((purchase) => (
                <tr key={purchase.id}>
                  <td><code>{purchase.purchase_number}</code></td>
                  <td>{new Date(`${purchase.purchase_date}T12:00:00`).toLocaleDateString('es-HN')}</td>
                  <td className="strong">{purchase.supplier_name}</td>
                  <td>{(purchase.purchase_items || []).length}</td>
                  <td className="green">{money(purchase.total)}</td>
                  <td><span className={`pill ${purchase.payment_status === 'paid' ? 'good' : 'warning'}`}>{purchase.payment_status === 'paid' ? 'Pagada' : 'Pendiente'}</span></td>
                  <td className="sale-actions">
                    <button className="button secondary small" onClick={() => setModal({ kind: 'purchaseDetail', purchase })}>Ver</button>
                    <button className="icon-button" aria-label={`Editar ${purchase.purchase_number}`} title="Editar compra" onClick={() => openPurchaseForm(purchase)}>✎</button>
                    <button className="icon-button danger-text" aria-label={`Eliminar ${purchase.purchase_number}`} title="Eliminar compra" onClick={() => deletePurchase(purchase)}>×</button>
                    {purchase.payment_status === 'pending' && <button className="button primary small" onClick={() => markAsPaid('purchases', purchase)}>Marcar pagada</button>}
                  </td>
                </tr>
              ))}
            </Table>
          </Section>
        )}
        {tab === 'webOrders' && (
          <Section title="Pedidos web" subtitle="El stock se descuenta al reservar el pedido; los pedidos pendientes no afectan las existencias">
            <Table headers={['Pedido', 'Fecha', 'Cliente', 'Productos', 'Total', 'Estado', 'Acciones']}>
              {data.webOrders.map((order) => {
                const statusLabel = {
                  pending: 'Pendiente',
                  confirmed: 'Reservado',
                  cancelled: 'Cancelado',
                  completed: 'Venta registrada',
                }[order.status] || order.status;
                const statusTone = order.status === 'completed' ? 'good'
                  : ['pending', 'confirmed'].includes(order.status) ? 'warning' : 'danger';
                return (
                  <tr key={order.id}>
                    <td><code>{order.order_number}</code></td>
                    <td>{new Date(order.created_at).toLocaleDateString('es-HN')}</td>
                    <td className="strong">{order.customer_name}<small className="table-secondary">{order.customer_phone}</small></td>
                    <td>{(order.web_order_items || []).map((item) => `${item.product_name} × ${item.quantity}`).join(', ')}</td>
                    <td className="green">{money(order.total)}</td>
                    <td><span className={`pill ${statusTone}`}>{statusLabel}</span></td>
                    <td className="sale-actions">
                      <button className="button secondary small" onClick={() => setModal({ kind: 'webOrderDetail', order })}>Ver</button>
                      {['pending', 'confirmed'].includes(order.status) && <>
                        {order.status === 'pending' && <button className="button secondary small" onClick={() => updateWebOrder(order, 'confirmed')}>Reservar</button>}
                        <button className="button primary small" onClick={() => setModal({ kind: 'completeWebOrder', order })}>Completar venta</button>
                        <button className="icon-button danger-text" aria-label="Cancelar pedido" title="Cancelar pedido y liberar stock" onClick={() => updateWebOrder(order, 'cancelled')}>×</button>
                      </>}
                      <button className="icon-button danger-text" aria-label={`Eliminar pedido ${order.order_number}`} title="Eliminar pedido" onClick={() => deleteWebOrder(order)}>⌫</button>
                      {order.sale_id && (() => {
                        const sale = data.sales.find((item) => item.id === order.sale_id);
                        return sale ? <button className="button secondary small" onClick={() => setModal({ kind: 'invoice', sale })}>Ver factura</button> : null;
                      })()}
                    </td>
                  </tr>
                );
              })}
            </Table>
          </Section>
        )}
        {tab === 'webProducts' && (
          <div className="web-admin-layout">
            <Section
              title="Catálogo de la tienda"
              subtitle={`${data.webProducts.length} productos · asigna un lote para mostrar disponibilidad en la tienda`}
              action="＋ Nuevo producto"
              onAction={() => openWebProduct()}
            >
              <div className="web-product-grid">
                {data.webProducts.map((product) => {
                  const batch = data.batches.find((item) => item.id === product.batch_id);
                  const recipeItem = data.recipes.find((item) => item.id === batch?.recipe_id);
                  const available = batch ? availableWebBatchStock(batch) : 0;
                  const image = product.image_path
                    ? supabase.storage.from('jabon').getPublicUrl(product.image_path).data.publicUrl
                    : null;
                  return <article className="web-product-card" key={product.id}>
                    {image
                      ? <img className="web-product-image" src={image} alt="" />
                      : <div className="web-product-image web-product-placeholder" aria-hidden="true">✦</div>}
                    <div className="web-product-card-content">
                      <div className="web-product-card-heading">
                        <div><h3>{product.name}</h3><span className={`pill ${product.active ? 'good' : 'warning'}`}>{product.active ? 'Visible' : 'Oculto'}</span></div>
                        <strong>{recipeItem?.prices.detail == null ? 'Sin precio' : money(recipeItem.prices.detail)}</strong>
                      </div>
                      <p>{batch ? `${batch.recipe_name} · ${batch.code}` : 'Sin lote asignado'}</p>
                      <div className="web-product-card-footer">
                        <span>{batch ? `${available} disponibles` : 'Asigna un lote para publicar'}</span>
                        <div>
                          <button className="icon-button" aria-label={`Editar ${product.name}`} title="Editar producto" onClick={() => openWebProduct(product)}>✎</button>
                          <button className="icon-button" aria-label={`Duplicar ${product.name}`} title="Duplicar producto" onClick={() => openWebProduct(product, true)}>⧉</button>
                          <button className="icon-button danger-text" aria-label={`Eliminar ${product.name}`} title="Eliminar producto" onClick={() => deleteWebProduct(product)}>×</button>
                        </div>
                      </div>
                    </div>
                  </article>;
                })}
                {data.webProducts.length === 0 && <Empty text="Agrega tu primer producto para organizar el catálogo de la tienda." />}
              </div>
              <div className="web-store-link"><a className="button secondary small" href="./storefront.html" target="_blank" rel="noreferrer">Abrir tienda pública ↗</a></div>
            </Section>
          </div>
        )}
        {tab === 'webSettings' && (
          <Section title="Configuración web" subtitle="Identidad y datos de contacto que aparecen en la tienda pública">
            <form className="web-editor stack-form" onSubmit={saveWebSettings}>
              <div className="form-grid">
                <Field label="Nombre del negocio"><input required maxLength="120" value={webSettingsDraft?.business_name || ''} onChange={(event) => setWebSettingsDraft({ ...webSettingsDraft, business_name: event.target.value })} /></Field>
                <Field label="Frase de marca"><input maxLength="180" value={webSettingsDraft?.tagline || ''} onChange={(event) => setWebSettingsDraft({ ...webSettingsDraft, tagline: event.target.value })} /></Field>
              </div>
              <Field label="Logo (JPG, PNG o WebP; máximo 8 MB)"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setWebLogoFile(event.target.files?.[0] || null)} /></Field>
              {webSettingsDraft?.logo_path && !webLogoFile && <p className="form-note">Ya hay un logo guardado. Sube otro para reemplazarlo.</p>}
              <div className="form-grid">
                <Field label="Teléfono de contacto"><input type="tel" maxLength="40" value={webSettingsDraft?.phone || ''} onChange={(event) => setWebSettingsDraft({ ...webSettingsDraft, phone: event.target.value })} /></Field>
                <Field label="WhatsApp para revendedores (con código de país)"><input type="tel" maxLength="40" value={webSettingsDraft?.whatsapp_phone || ''} onChange={(event) => setWebSettingsDraft({ ...webSettingsDraft, whatsapp_phone: event.target.value })} placeholder="50499999999" /></Field>
              </div>
              <div className="form-grid">
                <Field label="Correo electrónico"><input type="email" maxLength="254" value={webSettingsDraft?.email || ''} onChange={(event) => setWebSettingsDraft({ ...webSettingsDraft, email: event.target.value })} /></Field>
                <Field label="Dirección / zona de entrega"><input maxLength="300" value={webSettingsDraft?.address || ''} onChange={(event) => setWebSettingsDraft({ ...webSettingsDraft, address: event.target.value })} /></Field>
              </div>
              <Field label="Presentación del negocio"><textarea rows="5" maxLength="2000" value={webSettingsDraft?.about_text || ''} onChange={(event) => setWebSettingsDraft({ ...webSettingsDraft, about_text: event.target.value })} placeholder="Cuenta brevemente la historia de tu taller y cómo elaboras tus jabones." /></Field>
              <p className="form-note">El enlace para revendedores abre WhatsApp con el número configurado. No se publican credenciales secretas en la tienda.</p>
              <button className="button primary">Guardar configuración</button>
            </form>
          </Section>
        )}
        {tab === 'finance' && (
          <div className="finance-layout">
            <div className="report-period">
              <label>Desde<input type="date" value={reportPeriod.from} onChange={(event) => setReportPeriod({ ...reportPeriod, from: event.target.value })} /></label>
              <label>Hasta<input type="date" value={reportPeriod.to} onChange={(event) => setReportPeriod({ ...reportPeriod, to: event.target.value })} /></label>
            </div>
            <Section title="Estado de resultados" subtitle="Ventas emitidas, costo de productos vendidos y gastos del período seleccionado">
              <div className="statement-lines">
                <div><span>Ingresos por ventas</span><strong>{money(reports.revenue)}</strong></div>
                <div><span>Costo de productos vendidos</span><strong>− {money(reports.cost)}</strong></div>
                <div className="statement-subtotal"><span>Utilidad bruta</span><strong>{money(reports.grossProfit)}</strong></div>
                <div><span>Gastos operativos</span><strong>− {money(reports.expenses)}</strong></div>
                <div className="statement-total"><span>Utilidad neta</span><strong>{money(reports.netIncome)}</strong></div>
              </div>
            </Section>
            <Section title="Balance general de gestión" subtitle={`Saldos actuales · base de apertura: ${data.financeSettings?.opening_date || today}`}>
              {!data.financeSettings && <Notice type="error">No se encontraron saldos iniciales. Vuelve a cargar el esquema de Supabase.</Notice>}
              <div className="balance-grid">
                <div>
                  <h3>Activos</h3>
                  <div className="statement-lines compact">
                    <div><span>Efectivo y bancos</span><strong>{money(reports.cash)}</strong></div>
                    <div><span>Cuentas por cobrar</span><strong>{money(reports.receivables)}</strong></div>
                    <div><span>Inventario de materias primas</span><strong>{money(reports.rawInventory)}</strong></div>
                    <div><span>Insumos indirectos disponibles</span><strong>{money(reports.indirectInventory)}</strong></div>
                    <div><span>Inventario de jabones terminados</span><strong>{money(reports.finishedInventory)}</strong></div>
                    <div className="statement-total"><span>Total activos</span><strong>{money(reports.assets)}</strong></div>
                  </div>
                </div>
                <div>
                  <h3>Pasivos y patrimonio</h3>
                  <div className="statement-lines compact">
                    <div><span>Cuentas por pagar</span><strong>{money(reports.payables)}</strong></div>
                    <div><span>Capital de apertura y utilidades acumuladas</span><strong>{money(reports.equity)}</strong></div>
                    <div className="statement-total"><span>Total pasivos y patrimonio</span><strong>{money(reports.liabilitiesAndEquity)}</strong></div>
                    <div className={Math.abs(reports.difference) <= 0.02 ? 'balance-check balanced' : 'balance-check'}>
                      <span>Diferencia por conciliar</span><strong>{money(reports.difference)}</strong>
                    </div>
                  </div>
                </div>
              </div>
              <p className="form-note">Registra saldos iniciales como existían en la fecha de apertura. El patrimonio inicial debe incluir el valor de los activos menos las deudas de esa fecha; la diferencia indica movimientos aún no registrados.</p>
            </Section>
            <Section title="Saldos iniciales" subtitle="Configura caja, cuentas por cobrar/pagar y capital a la fecha de inicio">
              <form className="opening-form" onSubmit={saveOpeningBalances}>
                <label>Fecha de apertura<input type="date" required value={openingForm.opening_date} onChange={(event) => setOpeningForm({ ...openingForm, opening_date: event.target.value })} /></label>
                <label>Efectivo y bancos (LPS)<input type="number" min="0" step="0.01" required value={openingForm.opening_cash} onChange={(event) => setOpeningForm({ ...openingForm, opening_cash: event.target.value })} /></label>
                <label>Cuentas por cobrar (LPS)<input type="number" min="0" step="0.01" required value={openingForm.opening_receivables} onChange={(event) => setOpeningForm({ ...openingForm, opening_receivables: event.target.value })} /></label>
                <label>Cuentas por pagar (LPS)<input type="number" min="0" step="0.01" required value={openingForm.opening_payables} onChange={(event) => setOpeningForm({ ...openingForm, opening_payables: event.target.value })} /></label>
                <label>Capital / patrimonio inicial (LPS)<input type="number" step="0.01" required value={openingForm.opening_equity} onChange={(event) => setOpeningForm({ ...openingForm, opening_equity: event.target.value })} /></label>
                <button className="button primary">Guardar saldos</button>
                <p className="form-note">Incluye en los saldos iniciales el efectivo, las cuentas pendientes y el valor de las existencias a la fecha de apertura.</p>
              </form>
            </Section>
            <Section title="Registrar gasto" subtitle="Los gastos reducen la utilidad; los pendientes se suman a cuentas por pagar">
              <form className="expense-form" onSubmit={saveExpense}>
                <label>Descripción<input required value={expenseForm.description} onChange={(event) => setExpenseForm({ ...expenseForm, description: event.target.value })} placeholder="Ej. Transporte" /></label>
                <label>Categoría<input required value={expenseForm.category} onChange={(event) => setExpenseForm({ ...expenseForm, category: event.target.value })} placeholder="Ej. Operación" /></label>
                <label>Importe (LPS)<input type="number" min="0.01" step="0.01" required value={expenseForm.amount} onChange={(event) => setExpenseForm({ ...expenseForm, amount: event.target.value })} /></label>
                <label>Fecha<input type="date" required value={expenseForm.expenseDate} onChange={(event) => setExpenseForm({ ...expenseForm, expenseDate: event.target.value })} /></label>
                <label>Estado de pago<select value={expenseForm.paymentStatus} onChange={(event) => setExpenseForm({ ...expenseForm, paymentStatus: event.target.value })}><option value="paid">Pagado</option><option value="pending">Pendiente</option></select></label>
                <label>Método<select value={expenseForm.paymentMethod} onChange={(event) => setExpenseForm({ ...expenseForm, paymentMethod: event.target.value })}>{paymentMethods.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <button className="button primary">Guardar gasto</button>
              </form>
            </Section>
            <Section title="Gastos registrados" subtitle={`${data.expenses.length} gastos`}>
              <Table headers={['Fecha', 'Descripción', 'Categoría', 'Importe', 'Pago', '']}>
                {data.expenses.map((expense) => (
                  <tr key={expense.id}>
                    <td>{new Date(`${expense.expense_date}T12:00:00`).toLocaleDateString('es-HN')}</td>
                    <td className="strong">{expense.description}</td><td>{expense.category}</td>
                    <td className="green">{money(expense.amount)}</td>
                    <td><span className={`pill ${expense.payment_status === 'paid' ? 'good' : 'warning'}`}>{expense.payment_status === 'paid' ? 'Pagado' : 'Pendiente'}</span></td>
                    <td className="sale-actions">{expense.payment_status === 'pending' && <button className="button primary small" onClick={() => markAsPaid('expenses', expense)}>Marcar pagado</button>}</td>
                  </tr>
                ))}
              </Table>
            </Section>
          </div>
        )}
        <footer className="footer">Fragancia & Miel <span>·</span> Control de costos e inventario</footer>
      </main>
      </div>

      {modal && !['production', 'sale', 'purchase', 'purchaseDetail', 'invoice', 'completeWebOrder', 'webOrderDetail', 'webProduct'].includes(modal.kind) && (
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
              <Field label={`Costo unitario (LPS por ${modal.values.unit})`}>
                <input type="number" min="0" step="any" required value={modal.values.unitCost} onChange={(e) => setModal({ ...modal, values: { ...modal.values, unitCost: e.target.value } })} />
              </Field>
              <p className="form-note">Este costo se aplica a cada ingrediente de las recetas. El valor total del inventario se calcula con el stock inicial y las compras.</p>
            </>}
            {modal.kind === 'indirects' && <>
              <Field label="Tipo de asignación"><select value={modal.values.type} onChange={(e) => setModal({ ...modal, values: { ...modal.values, type: e.target.value } })}><option>Envase / Botella</option><option>Gasto Mensual Fijo</option></select></Field>
              <div className="form-grid">
                <Field label="Unidad de medida">
                  <select value={modal.values.measureUnit} onChange={(e) => setModal({ ...modal, values: { ...modal.values, measureUnit: e.target.value } })}>
                    <option value="g">Gramos (g)</option><option value="ml">Mililitros (ml)</option><option value="pza">Piezas (pza)</option>
                  </select>
                </Field>
                <Field label="Consumo por jabón">
                  <input type="number" min="0.001" step="0.001" required value={modal.values.consumptionPerSoap} onChange={(e) => setModal({ ...modal, values: { ...modal.values, consumptionPerSoap: e.target.value } })} />
                </Field>
                <Field label={`Existencias actuales (${modal.values.measureUnit})`}>
                  <input type="number" min="0" step="0.001" required value={modal.values.stock} onChange={(e) => setModal({ ...modal, values: { ...modal.values, stock: e.target.value } })} />
                </Field>
                <Field label={`Stock mínimo (${modal.values.measureUnit})`}>
                  <input type="number" min="0" step="0.001" required value={modal.values.minimumStock} onChange={(e) => setModal({ ...modal, values: { ...modal.values, minimumStock: e.target.value } })} />
                </Field>
              </div>
              <p className="form-note">Las compras agregan existencias en esta unidad y la producción consume la cantidad indicada por cada jabón. El sistema estima cuántos jabones puede cubrir el stock y avisa cuando llega al mínimo.</p>
            </>}
            {modal.kind === 'utensils' && <div className="form-grid">
              <Field label="Costo de adquisición (LPS)"><input type="number" min="0" step="any" required value={modal.values.cost} onChange={(e) => setModal({ ...modal, values: { ...modal.values, cost: e.target.value } })} /></Field>
              <Field label="Vida útil (jabones)"><input type="number" min="1" step="any" required value={modal.values.life} onChange={(e) => setModal({ ...modal, values: { ...modal.values, life: e.target.value } })} /></Field>
            </div>}
            <div className="dialog-actions"><button type="button" className="button secondary" onClick={() => setModal(null)}>Cancelar</button><button className="button primary">Guardar</button></div>
          </form>
        </Dialog>
      )}
      {modal?.kind === 'webProduct' && webProductDraft && (
        <Dialog className="sales-dialog web-product-dialog" title={webProductDraft.id ? 'Editar producto web' : 'Agregar producto a la tienda'} onClose={() => { setModal(null); setWebProductDraft(null); setWebProductFile(null); }}>
          <form className="stack-form" onSubmit={saveWebProduct}>
            <div className="form-grid">
              <Field label="Nombre del producto"><input required maxLength="120" value={webProductDraft.name} onChange={(event) => setWebProductDraft({ ...webProductDraft, name: event.target.value })} /></Field>
              <Field label="Lote de producción (opcional)">
                <select value={webProductDraft.batchId} onChange={(event) => setWebProductDraft({ ...webProductDraft, batchId: event.target.value })}>
                  <option value="">Sin lote por ahora</option>
                  {data.batches.map((batch) => {
                    const available = availableWebBatchStock(batch);
                    return <option key={batch.id} value={batch.id}>{batch.recipe_name} · {batch.code} · {available} disponibles</option>;
                  })}
                </select>
              </Field>
            </div>
            {!webProductDraft.batchId && <p className="form-note">Puedes guardarlo sin lote. No aparecerá en la tienda pública hasta que le asignes un lote producido.</p>}
            <div className="form-grid">
              <Field label="Foto del producto (JPG, PNG o WebP; máximo 8 MB)">
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setWebProductFile(event.target.files?.[0] || null)} />
              </Field>
              <Field label="Orden en el catálogo"><input type="number" step="1" value={webProductDraft.sortOrder} onChange={(event) => setWebProductDraft({ ...webProductDraft, sortOrder: event.target.value })} /></Field>
            </div>
            {webProductDraft.imagePath && !webProductFile && <p className="form-note">Ya hay una imagen guardada. Sube otra para reemplazarla.</p>}
            <Field label="Beneficios (un beneficio por línea)"><textarea rows="4" value={webProductDraft.benefits} onChange={(event) => setWebProductDraft({ ...webProductDraft, benefits: event.target.value })} placeholder={'Suaviza la piel\nElaborado artesanalmente'} /></Field>
            <Field label="Afecciones que ayuda a tratar (separadas por comas)"><textarea rows="2" value={webProductDraft.healthConcerns} onChange={(event) => setWebProductDraft({ ...webProductDraft, healthConcerns: event.target.value })} placeholder="Acné, resequedad, piel sensible" /></Field>
            <Field label="Composición y unidades (un ingrediente por línea)"><textarea rows="4" value={webProductDraft.composition} onChange={(event) => setWebProductDraft({ ...webProductDraft, composition: event.target.value })} placeholder={'Base de glicerina: 90 g\nAceite de coco: 5 ml'} /></Field>
            <Field label="Modo de uso"><textarea rows="3" maxLength="1000" value={webProductDraft.usageInstructions} onChange={(event) => setWebProductDraft({ ...webProductDraft, usageInstructions: event.target.value })} /></Field>
            <label className="checkbox-field"><input type="checkbox" checked={webProductDraft.active} onChange={(event) => setWebProductDraft({ ...webProductDraft, active: event.target.checked })} /> Producto visible en la tienda</label>
            <div className="dialog-actions">
              <button type="button" className="button secondary" onClick={() => { setModal(null); setWebProductDraft(null); setWebProductFile(null); }}>Cancelar</button>
              <button className="button primary">{webProductDraft.id ? 'Guardar cambios' : 'Crear producto'}</button>
            </div>
          </form>
        </Dialog>
      )}
      {modal?.kind === 'sale' && saleDraft && (
        <Dialog className="sales-dialog" title={saleDraft.id ? 'Editar venta' : 'Crear venta'} onClose={() => { setModal(null); setSaleDraft(null); }}>
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
            <Field label="Estado de pago">
              <select value={saleDraft.paymentStatus} onChange={(event) => setSaleDraft({ ...saleDraft, paymentStatus: event.target.value })}>
                <option value="paid">Pagado al emitir</option>
                <option value="pending">Pendiente de cobro</option>
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
                    <input aria-label="Cantidad" placeholder="Cant." type="number" min="1" step="1" required value={item.quantity} onChange={(event) => setSaleDraft({
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
            <div className="sale-total"><span>Total de la venta</span><strong>{money(saleDraftTotal)}</strong></div>
            <p className="form-note">La venta queda en borrador. Al emitir la factura se verifica y descuenta el stock de jabones terminados.</p>
            <div className="dialog-actions">
              <button type="button" className="button secondary" onClick={() => { setModal(null); setSaleDraft(null); }}>Cancelar</button>
              <button className="button primary">Guardar venta</button>
            </div>
          </form>
        </Dialog>
      )}
      {modal?.kind === 'purchase' && purchaseDraft && (
        <Dialog className="sales-dialog" title={purchaseDraft.id ? 'Editar compra' : 'Registrar compra'} onClose={() => { setModal(null); setPurchaseDraft(null); }}>
          <form className="stack-form" onSubmit={savePurchase}>
            <div className="form-grid">
              <Field label="Proveedor (opcional)"><input value={purchaseDraft.supplierName} placeholder="Proveedor general" onChange={(event) => setPurchaseDraft({ ...purchaseDraft, supplierName: event.target.value })} /></Field>
              <Field label="Fecha de compra"><input type="date" required value={purchaseDraft.purchaseDate} onChange={(event) => setPurchaseDraft({ ...purchaseDraft, purchaseDate: event.target.value })} /></Field>
            </div>
            <div className="form-grid">
              <Field label="Estado de pago"><select value={purchaseDraft.paymentStatus} onChange={(event) => setPurchaseDraft({ ...purchaseDraft, paymentStatus: event.target.value })}><option value="paid">Pagada</option><option value="pending">Pendiente</option></select></Field>
              <Field label="Método de pago"><select value={purchaseDraft.paymentMethod} onChange={(event) => setPurchaseDraft({ ...purchaseDraft, paymentMethod: event.target.value })}>{paymentMethods.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
            </div>
            <div className="sale-lines">
              <div className="list-heading"><h3>Artículos comprados</h3><button type="button" className="text-button" onClick={() => setPurchaseDraft({ ...purchaseDraft, items: [...purchaseDraft.items, { itemType: 'materials', itemId: '', quantity: '', unitCost: '' }] })}>＋ Agregar artículo</button></div>
              {purchaseDraft.items.map((item, index) => {
                const catalog = {
                  materials: data.materials,
                  indirects: data.indirects,
                  utensils: data.utensils,
                }[item.itemType];
                const selectedItem = catalog.find((entry) => entry.id === item.itemId);
                const typeLabels = { materials: 'Materia prima', indirects: 'Insumo indirecto', utensils: 'Utensilio' };
                const unitLabel = item.itemType === 'materials' ? selectedItem?.unit || 'unidades'
                  : item.itemType === 'indirects' ? selectedItem?.measureUnit || 'unidad'
                    : 'usos de vida útil';
                return (
                  <div className="purchase-item-row" key={`${index}-${item.itemId}`}>
                    <select aria-label="Tipo de artículo" value={item.itemType} onChange={(event) => setPurchaseDraft({
                      ...purchaseDraft,
                      items: purchaseDraft.items.map((row, rowIndex) => rowIndex === index ? { ...row, itemType: event.target.value, itemId: '' } : row),
                    })}>
                      {Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                    <select aria-label="Artículo comprado" value={item.itemId} required onChange={(event) => setPurchaseDraft({
                      ...purchaseDraft,
                      items: purchaseDraft.items.map((row, rowIndex) => rowIndex === index ? { ...row, itemId: event.target.value } : row),
                    })}>
                      <option value="" disabled>Selecciona</option>
                      {catalog.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
                    </select>
                    <input aria-label={item.itemType === 'utensils' ? 'Usos comprados' : `Cantidad comprada en ${unitLabel}`} placeholder={item.itemType === 'utensils' ? 'Usos' : unitLabel} type="number" min="0.001" step="0.001" required value={item.quantity} onChange={(event) => setPurchaseDraft({
                      ...purchaseDraft,
                      items: purchaseDraft.items.map((row, rowIndex) => rowIndex === index ? { ...row, quantity: event.target.value } : row),
                    })} />
                    <input aria-label={`Costo unitario en LPS por ${unitLabel}`} type="number" min="0" step="0.000001" required value={item.unitCost} placeholder={`LPS / ${unitLabel}`} onChange={(event) => setPurchaseDraft({
                      ...purchaseDraft,
                      items: purchaseDraft.items.map((row, rowIndex) => rowIndex === index ? { ...row, unitCost: event.target.value } : row),
                    })} />
                    <span className="sale-line-price">{selectedItem ? `${unitLabel} · ${money(number(item.quantity) * number(item.unitCost))}` : '—'}</span>
                    <button type="button" className="icon-button danger-text" aria-label="Quitar artículo" onClick={() => setPurchaseDraft({
                      ...purchaseDraft,
                      items: purchaseDraft.items.filter((_, rowIndex) => rowIndex !== index),
                    })}>×</button>
                  </div>
                );
              })}
            </div>
            <div className="sale-total">
              <span>Total de compra</span>
              <strong>{money(purchaseDraft.items.reduce((sum, item) => sum + number(item.quantity) * number(item.unitCost), 0))}</strong>
            </div>
            <p className="form-note">Ingresa el costo de una unidad del artículo; el importe de cada línea se calcula como cantidad × costo unitario. La compra suma stock y costo a materias primas, rendimiento a insumos indirectos y vida útil (usos) a utensilios.</p>
            <div className="dialog-actions">
              <button type="button" className="button secondary" onClick={() => { setModal(null); setPurchaseDraft(null); }}>Cancelar</button>
              <button className="button primary">{purchaseDraft.id ? 'Guardar cambios' : 'Registrar compra'}</button>
            </div>
          </form>
        </Dialog>
      )}
      {modal?.kind === 'purchaseDetail' && (
        <Dialog title={`Compra ${modal.purchase.purchase_number}`} onClose={() => setModal(null)}>
          <div className="invoice-meta">
            <p><span>Proveedor</span><strong>{modal.purchase.supplier_name}</strong></p>
            <p><span>Fecha</span><strong>{new Date(`${modal.purchase.purchase_date}T12:00:00`).toLocaleDateString('es-HN')}</strong></p>
            <p><span>Pago</span><strong>{modal.purchase.payment_status === 'paid' ? 'Pagada' : 'Pendiente'}</strong></p>
            <p><span>Método</span><strong>{paymentMethods.find(([value]) => value === modal.purchase.payment_method)?.[1] || 'Otro'}</strong></p>
          </div>
          <Table headers={['Artículo', 'Tipo', 'Cantidad / unidad', 'Costo unitario', 'Total']}>
            {(modal.purchase.purchase_items || []).map((item) => {
              const unitLabel = item.unit_label
                || (item.item_type === 'indirects'
                  ? data.indirects.find((entry) => entry.id === item.indirect_id)?.measureUnit
                  : item.item_type === 'materials'
                    ? data.materials.find((entry) => entry.id === item.material_id)?.unit
                    : 'uso')
                || 'unidad';
              return (
                <tr key={item.id}>
                  <td>{item.item_name || item.material_name}</td>
                  <td>{{ materials: 'Materia prima', indirects: 'Insumo indirecto', utensils: 'Utensilio' }[item.item_type || 'materials']}</td>
                  <td>{item.quantity} {unitLabel}</td>
                  <td>{unitMoney(item.unit_cost)} / {unitLabel}</td>
                  <td>{money(item.line_total)}</td>
                </tr>
              );
            })}
          </Table>
          <div className="sale-total purchase-detail-total"><span>Total de compra</span><strong>{money(modal.purchase.total)}</strong></div>
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
              <p><span>Estado</span><strong>{modal.sale.payment_status === 'paid' ? 'Pagado' : 'Pendiente de cobro'}</strong></p>
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
      {modal?.kind === 'completeWebOrder' && (
        <Dialog title={`Completar pedido ${modal.order.order_number}`} onClose={() => setModal(null)}>
          <form className="stack-form" onSubmit={completeWebOrder}>
            <p className="form-note">Al completar, se creará una venta y se descontará el lote reservado del inventario de productos terminados.</p>
            <Field label="Método de pago">
              <select name="paymentMethod" defaultValue="cash">
                {paymentMethods.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
            <Field label="Estado de pago">
              <select name="paymentStatus" defaultValue="paid">
                <option value="paid">Pagado</option><option value="pending">Pendiente de cobro</option>
              </select>
            </Field>
            <div className="sale-total"><span>Total del pedido</span><strong>{money(modal.order.total)}</strong></div>
            <div className="dialog-actions">
              <button type="button" className="button secondary" onClick={() => setModal(null)}>Volver</button>
              <button className="button primary">Crear venta</button>
            </div>
          </form>
        </Dialog>
      )}
      {modal?.kind === 'webOrderDetail' && (
        <Dialog title={`Pedido web ${modal.order.order_number}`} onClose={() => setModal(null)}>
          <div className="invoice-meta">
            <p><span>Cliente</span><strong>{modal.order.customer_name}</strong></p>
            <p><span>Teléfono</span><strong>{modal.order.customer_phone}</strong></p>
            <p><span>Correo</span><strong>{modal.order.customer_email || '—'}</strong></p>
            <p><span>Dirección / entrega</span><strong>{modal.order.delivery_address || 'No especificada'}</strong></p>
            <p><span>Fecha</span><strong>{new Date(modal.order.created_at).toLocaleString('es-HN')}</strong></p>
            <p><span>Estado</span><strong>{modal.order.status}</strong></p>
          </div>
          {modal.order.notes && <p className="form-note">Nota: {modal.order.notes}</p>}
          <Table headers={['Producto', 'Lote', 'Cantidad', 'Precio', 'Importe']}>
            {(modal.order.web_order_items || []).map((item) => (
              <tr key={item.id}>
                <td>{item.product_name}</td>
                <td><code>{data.batches.find((batch) => batch.id === item.batch_id)?.code || '—'}</code></td>
                <td>{item.quantity}</td><td>{money(item.unit_price)}</td><td>{money(item.line_total)}</td>
              </tr>
            ))}
          </Table>
          <div className="sale-total purchase-detail-total"><span>Total del pedido</span><strong>{money(modal.order.total)}</strong></div>
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
