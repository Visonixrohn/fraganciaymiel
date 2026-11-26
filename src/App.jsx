import { Children, isValidElement, useCallback, useEffect, useMemo, useState } from 'react';
import { isSupabaseConfigured, supabase } from './supabase.js';

const navigationGroups = [
  {
    label: 'Inicio',
    items: [
      ['dashboard', 'Dashboard', '▦'],
    ],
  },
  {
    label: 'Inventario',
    items: [
      ['inventoryTakes', 'Tomas de inventario', '▤'],
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
    label: 'Ventas y finanzas',
    items: [
      ['sales', 'Facturación', '▧'],
      ['collections', 'Cobros pendientes', '＄'],
      ['purchases', 'Compras', '＋'],
      ['expenses', 'Gastos', '−'],
      ['loans', 'Prestado', '↗'],
      ['finance', 'Finanzas', '＄'],
    ],
  },
  {
    label: 'Comercial',
    items: [
      ['webOrders', 'Pedidos web', '🛍'],
      ['reservations', 'Reservaciones', '◷'],
      ['customOrders', 'Pedidos a crear', '✎'],
      ['marketing', 'Venta y promoción', '◷'],
    ],
  },
  {
    label: 'Administración',
    items: [
      ['settings', 'Configuraciones', '⚙'],
      ['webProducts', 'Productos web', '▣'],
      ['webSettings', 'Configuración web', '⚙'],
    ],
  },
];
const paymentStatusLabels = { paid: 'Pagado', pending: 'Pendiente', lost: 'Perdida' };
const collectionFilters = [
  ['pending', 'Pendientes'],
  ['done', 'Atendidos'],
  ['all', 'Todos'],
];
const webOrderFilters = [
  ['pending', 'Pedido'],
  ['confirmed', 'Reservado'],
  ['completed', 'Vendido'],
  ['cancelled', 'Rechazado'],
];
const customOrderFilters = [
  ['created', 'Creado'],
  ['rejected', 'Rechazado'],
  ['pending', 'Pendiente'],
];
const mobileQuickNavigation = [
  ['materials', 'Stock', '◈'],
  ['recipes', 'Recetas', '⌗'],
  ['customOrders', 'Pedidos', '✎'],
];
const inventoryTakeCategories = [
  ['soap', 'Jabones', '▦'],
  ['utensils', 'Utensilios', '⌑'],
  ['materials', 'Materia prima', '◈'],
];
const themeStorageKey = 'fragancia-y-miel-theme';
const preferencesStorageKey = 'fragancia-y-miel-preferences';
const defaultPreferences = {
  accentColor: '#2563eb',
  fontFamily: 'Inter, sans-serif',
  fontScale: 1,
  navigationPosition: 'left',
};
const accentPresets = [
  ['#2563eb', 'Azul'],
  ['#28865a', 'Bosque'],
  ['#3478bd', 'Océano'],
  ['#aa536f', 'Rosa'],
  ['#7652a8', 'Violeta'],
];
const fontOptions = [
  ['Inter, sans-serif', 'Inter'],
  ['"DM Sans", sans-serif', 'DM Sans'],
  ['Arial, sans-serif', 'Arial'],
  ['Georgia, serif', 'Georgia'],
  ['"Trebuchet MS", sans-serif', 'Trebuchet MS'],
  ['system-ui, sans-serif', 'Sistema'],
];
const navigationPositions = [
  ['left', 'Izquierda'],
  ['right', 'Derecha'],
  ['header', 'Header'],
  ['bottom', 'Parte inferior'],
];

function getSavedPreferences() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(preferencesStorageKey) || '{}');
    const allowedFonts = new Set(fontOptions.map(([value]) => value));
    const allowedPositions = new Set(navigationPositions.map(([value]) => value));
    return {
      accentColor: /^#[0-9a-f]{6}$/i.test(saved.accentColor) ? saved.accentColor : defaultPreferences.accentColor,
      fontFamily: allowedFonts.has(saved.fontFamily) ? saved.fontFamily : defaultPreferences.fontFamily,
      fontScale: [0.9, 1, 1.1, 1.2].includes(saved.fontScale) ? saved.fontScale : defaultPreferences.fontScale,
      navigationPosition: allowedPositions.has(saved.navigationPosition) ? saved.navigationPosition : defaultPreferences.navigationPosition,
    };
  } catch {
    return defaultPreferences;
  }
}

function getSavedTheme() {
  try {
    return window.localStorage.getItem(themeStorageKey) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

const money = (value) => `L ${Number(value || 0).toFixed(2)}`;
const unitMoney = (value) => `L ${new Intl.NumberFormat('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 6 }).format(Number(value || 0))}`;
const number = (value) => Number(value || 0);
const dateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
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
const fromUtensil = (row) => ({
  ...row,
  cost: number(row.cost),
  life: number(row.useful_life),
  stock: number(row.stock),
});
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
  const [deletingSale, setDeletingSale] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(null);
  const [tab, setTab] = useState('dashboard');
  const [collapsedNavigationGroups, setCollapsedNavigationGroups] = useState(
    () => new Set(navigationGroups.map(({ label }) => label)),
  );
  const [openHorizontalNavigationGroup, setOpenHorizontalNavigationGroup] = useState(null);
  const [theme, setTheme] = useState(getSavedTheme);
  const [preferences, setPreferences] = useState(getSavedPreferences);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(`${today.slice(0, 7)}-01T12:00:00`));
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(today);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [collectionFilter, setCollectionFilter] = useState('pending');
  const [webOrderFilter, setWebOrderFilter] = useState('pending');
  const [customOrderFilter, setCustomOrderFilter] = useState('pending');
  const [salesSearch, setSalesSearch] = useState('');
  const [salesFilter, setSalesFilter] = useState('all');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileFormOpen, setMobileFormOpen] = useState(null);
  const [materialSearch, setMaterialSearch] = useState('');
  const [webProductSearch, setWebProductSearch] = useState('');
  const [productionRecipeSearch, setProductionRecipeSearch] = useState('');
  const [productionRecipeId, setProductionRecipeId] = useState('');
  const [data, setData] = useState({
    materials: [],
    indirects: [],
    utensils: [],
    recipes: [],
    batches: [],
    sales: [],
    purchases: [],
    expenses: [],
    additionalIncomes: [],
    collectionReminders: [],
    manualReservations: [],
    businessLoans: [],
    loanRepayments: [],
    promotionEvents: [],
    financeSettings: null,
    webSettings: null,
    webProducts: [],
    webOrders: [],
    customOrders: [],
    inventoryTakes: [],
  });
  const [modal, setModal] = useState(null);
  const [inventoryTakeDraft, setInventoryTakeDraft] = useState([]);
  const [inventoryTakeCategory, setInventoryTakeCategory] = useState('soap');
  const [inventoryTakeSaving, setInventoryTakeSaving] = useState(false);
  const [inventoryTakeSaved, setInventoryTakeSaved] = useState(false);
  const [inventoryTakeId, setInventoryTakeId] = useState(null);
  const [inventoryTakeApplied, setInventoryTakeApplied] = useState(false);
  const [inventoryTakeCode, setInventoryTakeCode] = useState('');
  const [inventoryTakeConfirmingAdjustment, setInventoryTakeConfirmingAdjustment] = useState(false);
  const [inventoryTakeAdjusting, setInventoryTakeAdjusting] = useState(false);
  const [saleDraft, setSaleDraft] = useState(null);
  const [purchaseDraft, setPurchaseDraft] = useState(null);
  const [webProductDraft, setWebProductDraft] = useState(null);
  const [webProductFile, setWebProductFile] = useState(null);
  const [webLogoFile, setWebLogoFile] = useState(null);
  const [webLogoPreview, setWebLogoPreview] = useState('');
  const [webSettingsDraft, setWebSettingsDraft] = useState(null);
  const [additionalIncomeForm, setAdditionalIncomeForm] = useState({
    concept: '',
    amount: '',
    incomeDate: today,
    paymentStatus: 'paid',
    paymentMethod: 'cash',
  });
  const [collectionReminderForm, setCollectionReminderForm] = useState({
    customerName: '',
    customerPhone: '',
    concept: '',
    amount: '',
    dueDate: today,
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
    if (!webLogoFile) {
      setWebLogoPreview('');
      return undefined;
    }
    const previewUrl = URL.createObjectURL(webLogoFile);
    setWebLogoPreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [webLogoFile]);

  useEffect(() => {
    try {
      window.localStorage.setItem(themeStorageKey, theme);
    } catch (storageError) {
      console.warn('No se pudo guardar el tema seleccionado.', storageError);
    }
  }, [theme]);

  useEffect(() => {
    try {
      window.localStorage.setItem(preferencesStorageKey, JSON.stringify(preferences));
    } catch (storageError) {
      console.warn('No se pudieron guardar las configuraciones en este navegador.', storageError);
    }
  }, [preferences]);

  useEffect(() => {
    const handleInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    const handleInstalled = () => setInstallPrompt(null);
    window.addEventListener('beforeinstallprompt', handleInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
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
      supabase.from('additional_incomes').select('*').order('income_date', { ascending: false }),
      supabase.from('collection_reminders').select('*').order('due_date', { ascending: true }),
      supabase.from('manual_reservations').select('*').order('reservation_date', { ascending: false }),
      supabase.from('business_loans').select('*').order('loan_date', { ascending: false }),
      supabase.from('business_loan_repayments').select('*').order('payment_date', { ascending: false }),
      supabase.from('finance_settings').select('*').eq('id', 1).maybeSingle(),
      supabase.from('web_settings').select('*').eq('id', 1).maybeSingle(),
      supabase.from('web_products').select('*, web_product_batches(batch_id)').order('sort_order').order('name'),
      supabase.from('web_orders').select('*, web_order_items(*)').order('created_at', { ascending: false }),
      supabase.from('custom_orders').select('*').order('created_at', { ascending: false }),
      supabase.from('promotion_events').select('*').order('event_date'),
      supabase.from('inventory_takes').select('*, inventory_take_items(*)').order('created_at', { ascending: false }),
    ]);
    const failed = queries.find(({ error: queryError }) => queryError);
    if (failed) {
      setError(failed.error.message);
    } else {
      const [
        materials, indirects, utensils, recipes, batches, sales, purchases, expenses, additionalIncomes,
        collectionReminders, manualReservations, businessLoans, loanRepayments, financeSettings,
        webSettings, webProducts, webOrders, customOrders, promotionEvents,
        inventoryTakes,
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
        additionalIncomes,
        collectionReminders,
        manualReservations,
        businessLoans,
        loanRepayments,
        financeSettings,
        webSettings,
        webProducts,
        webOrders,
        customOrders,
        promotionEvents,
        inventoryTakes,
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
        tiktok_url: '',
        facebook_url: '',
        instagram_url: '',
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
        if (payload.new?.status === 'pending') {
          toast(`¡Nuevo pedido web${payload.new?.order_number ? ` ${payload.new.order_number}` : ''}!`);
        }
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

  const activeWebOrderCount = data.webOrders
    .filter((order) => order.status === 'pending').length;
  const webOrderCounts = useMemo(() => Object.fromEntries(webOrderFilters.map(([status]) => [
    status,
    data.webOrders.filter((order) => order.status === status).length,
  ])), [data.webOrders]);
  const visibleWebOrders = useMemo(() => data.webOrders
    .filter((order) => order.status === webOrderFilter), [data.webOrders, webOrderFilter]);
  const reservationRows = useMemo(() => [
    ...data.webOrders
      .filter((order) => ['pending', 'confirmed'].includes(order.status))
      .map((order) => ({
        id: order.id,
        source: 'web',
        date: order.created_at,
        customer: order.customer_name,
        phone: order.customer_phone,
        product: (order.web_order_items || []).map((item) => `${item.product_name} × ${item.quantity}`).join(', '),
        quantity: (order.web_order_items || []).reduce((sum, item) => sum + number(item.quantity), 0),
        status: order.status,
        order,
      })),
    ...data.manualReservations
      .filter((reservation) => reservation.status === 'active')
      .map((reservation) => ({
        id: reservation.id,
        source: 'manual',
        date: `${reservation.reservation_date}T12:00:00`,
        customer: reservation.customer_name,
        phone: reservation.customer_phone,
        product: reservation.product_name,
        quantity: reservation.quantity,
        status: reservation.status,
        reservation,
      })),
  ].sort((a, b) => String(b.date).localeCompare(String(a.date))),
  [data.manualReservations, data.webOrders]);
  const loanRows = useMemo(() => data.businessLoans.map((loan) => {
    const repaid = data.loanRepayments
      .filter((repayment) => repayment.business_loan_id === loan.id)
      .reduce((sum, repayment) => sum + number(repayment.amount), 0);
    return { ...loan, repaid, outstanding: Math.max(0, number(loan.principal) - repaid) };
  }), [data.businessLoans, data.loanRepayments]);
  const customOrderCounts = useMemo(() => Object.fromEntries(customOrderFilters.map(([status]) => [
    status,
    data.customOrders.filter((order) => order.status === status).length,
  ])), [data.customOrders]);
  const visibleCustomOrders = useMemo(() => data.customOrders
    .filter((order) => order.status === customOrderFilter), [data.customOrders, customOrderFilter]);
  const potentialCustomOrderIncome = useMemo(() => data.customOrders
    .filter((order) => order.status !== 'rejected')
    .reduce((sum, order) => sum + number(order.order_value), 0), [data.customOrders]);
  const collectionCounts = useMemo(() => ({
    pending: data.collectionReminders.filter((reminder) => reminder.status === 'pending').length,
    done: data.collectionReminders.filter((reminder) => reminder.status === 'done').length,
    all: data.collectionReminders.length,
  }), [data.collectionReminders]);
  const collectionRows = useMemo(() => data.collectionReminders
    .filter((reminder) => collectionFilter === 'all' || reminder.status === collectionFilter),
  [collectionFilter, data.collectionReminders]);
  const pendingCollectionsTotal = useMemo(() => data.collectionReminders
    .filter((reminder) => reminder.status === 'pending')
    .reduce((sum, reminder) => sum + number(reminder.amount), 0), [data.collectionReminders]);
  const visibleSales = useMemo(() => {
    const query = salesSearch.trim().toLocaleLowerCase('es');
    return data.sales.filter((sale) => {
      if (salesFilter === 'draft' || salesFilter === 'issued') {
        if (sale.status !== salesFilter) return false;
      } else if (salesFilter !== 'all'
        && (sale.status !== 'issued' || sale.payment_status !== salesFilter)) return false;
      const invoiceNumber = sale.invoice_number || `VTA-${sale.id.slice(0, 8).toUpperCase()}`;
      return !query || [
        invoiceNumber,
        sale.customer_name,
        sale.customer_phone,
        ...(sale.sale_items || []).map((item) => item.recipe_name),
      ].some((value) => String(value || '').toLocaleLowerCase('es').includes(query));
    });
  }, [data.sales, salesFilter, salesSearch]);

  function openMobileForm(formId) {
    if (window.matchMedia('(max-width: 900px)').matches) setMobileFormOpen(formId);
  }

  function openInventoryTake() {
    setInventoryTakeDraft(inventoryCountItems.map((item) => ({
      ...item,
      countedQuantity: String(item.systemQuantity),
    })));
    setInventoryTakeCategory('soap');
    setInventoryTakeSaved(false);
    setInventoryTakeId(null);
    setInventoryTakeApplied(false);
    setInventoryTakeCode('');
    setInventoryTakeConfirmingAdjustment(false);
    setModal({ kind: 'inventoryTake', notes: '' });
  }

  function openInventoryTakeHistory(take) {
    setInventoryTakeCategory('soap');
    setInventoryTakeSaved(true);
    setInventoryTakeApplied(Boolean(take.adjusted_at));
    setInventoryTakeId(take.id);
    setInventoryTakeDraft((take.inventory_take_items || []).map((item) => ({
      category: item.category,
      itemId: item.item_id,
      systemQuantity: number(item.system_quantity),
      countedQuantity: String(item.counted_quantity),
    })));
    setInventoryTakeCode('');
    setInventoryTakeConfirmingAdjustment(false);
    setModal({ kind: 'inventoryTake', history: take });
  }

  async function saveInventoryTake(event) {
    event.preventDefault();
    if (inventoryTakeSaving || inventoryTakeSaved) return;
    const notes = modal?.notes?.trim() || '';
    const invalidCount = inventoryTakeDraft.some((item) => {
      const count = Number(item.countedQuantity);
      return !Number.isFinite(count)
        || count < 0
        || (item.category !== 'materials' && !Number.isInteger(count))
        || (item.category === 'materials' && Math.abs(count * 1000 - Math.round(count * 1000)) > 1e-8);
    });
    if (!inventoryTakeDraft.length || invalidCount || notes.length > 500) {
      toast('Revisa las cantidades y las notas antes de guardar la toma.', 'error');
      return;
    }

    setInventoryTakeSaving(true);
    try {
      const { data: takeId, error: saveError } = await supabase.rpc('record_inventory_take', {
        p_notes: notes || null,
        p_items: inventoryTakeDraft.map((item) => ({
          category: item.category,
          item_id: item.itemId,
          item_code: item.code,
          item_name: item.name,
          system_quantity: item.systemQuantity,
          counted_quantity: Number(item.countedQuantity),
        })),
      });
      if (saveError) {
        toast(saveError.message, 'error');
        return;
      }
      setInventoryTakeSaved(true);
      setInventoryTakeId(takeId);
      toast('Conteo guardado. Revisa las diferencias antes de ajustar.');
      await loadData();
    } catch (saveError) {
      toast(saveError?.message || 'No se pudo guardar la toma de inventario.', 'error');
    } finally {
      setInventoryTakeSaving(false);
    }
  }

  async function applyInventoryTake(event) {
    event.preventDefault();
    if (inventoryTakeAdjusting || !inventoryTakeId || !inventoryTakeConfirmingAdjustment || inventoryTakeApplied) return;
    if (inventoryTakeCode !== ACCESS_CODE) {
      toast('La clave de inicio de sesión no es válida.', 'error');
      return;
    }

    setInventoryTakeAdjusting(true);
    try {
      const { error: adjustError } = await supabase.rpc('apply_inventory_take', {
        p_take_id: inventoryTakeId,
        p_access_code: inventoryTakeCode,
      });
      if (adjustError) {
        toast(adjustError.message, 'error');
        return;
      }
      setInventoryTakeApplied(true);
      setInventoryTakeConfirmingAdjustment(false);
      setInventoryTakeCode('');
      toast('Ajuste de inventario aplicado');
      await loadData();
    } catch (adjustError) {
      toast(adjustError?.message || 'No se pudo aplicar el ajuste de inventario.', 'error');
    } finally {
      setInventoryTakeAdjusting(false);
    }
  }

  const soapStockRows = useMemo(() => data.webProducts.flatMap((product) => {
    const batches = getWebProductBatches(product);
    const batchRows = batches
      .map((batch) => ({ product, batch, available: availableWebBatchStock(batch) }));
    return batchRows.length
      ? batchRows
      : [{ product, batch: null, available: 0 }];
  }), [data]);
  const saleProducts = useMemo(() => data.webProducts.map((product) => ({
    product,
    recipe: getWebProductRecipe(product),
  })).filter(({ product, recipe }) => recipe
    && priceTypes.some(([value]) => recipe.prices[value] != null)
    && (product.promotion_price != null || product.normal_price != null)), [data]);
  const soapStockTotals = useMemo(() => soapStockRows.reduce((totals, row) => ({
    produced: totals.produced + number(row.batch?.quantity),
    available: totals.available + number(row.available),
  }), { produced: 0, available: 0 }), [soapStockRows]);

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
  const inventoryCountItems = useMemo(() => {
    const soapItems = data.batches.map((batch) => {
      const product = data.webProducts.find((entry) => getWebProductBatches(entry)
        .some((assignedBatch) => assignedBatch.id === batch.id));
      return {
        category: 'soap',
        itemId: batch.id,
        code: batch.code,
        name: `${product?.name || batch.recipe_name} · ${batch.code}`,
        unit: 'jabones',
        systemQuantity: availableWebBatchStock(batch) + reservedWebBatchStock(batch),
      };
    });
    const utensilItems = data.utensils.map((item) => ({
      category: 'utensils',
      itemId: item.id,
      code: item.code,
      name: item.name,
      unit: 'piezas',
      systemQuantity: item.stock,
    }));
    const materialItems = data.materials.map((item) => ({
      category: 'materials',
      itemId: item.id,
      code: item.code,
      name: item.name,
      unit: item.unit,
      systemQuantity: item.initial + item.purchased - item.used,
    }));
    return [...soapItems, ...utensilItems, ...materialItems];
  }, [data.batches, data.materials, data.utensils, data.webProducts]);
  const visibleWebProducts = useMemo(() => {
    const query = webProductSearch.trim().toLocaleLowerCase('es');
    return data.webProducts.filter((product) => {
      const batches = getWebProductBatches(product);
      return !query || [product.name, ...batches.flatMap((batch) => [batch.code, batch.recipe_name])]
        .some((value) => String(value || '').toLocaleLowerCase('es').includes(query));
    });
  }, [data.batches, data.webProducts, webProductSearch]);

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
      const { product } = saleProducts.find(({ product: entry }) => entry.id === item.webProductId) || {};
      return total + number(product?.promotion_price ?? product?.normal_price) * number(item.quantity);
    }, 0);
  }, [saleProducts, saleDraft]);

  const reports = useMemo(() => {
    const withinPeriod = (date) => {
      const reportDate = date?.slice(0, 10);
      return Boolean(reportDate && reportDate >= reportPeriod.from && reportDate <= reportPeriod.to);
    };
    const periodSales = data.sales.filter((sale) => sale.status === 'issued' && withinPeriod(sale.invoice_date));
    const periodRevenue = periodSales.reduce((sum, sale) => sum + number(sale.total), 0);
    const paidSales = periodSales.filter((sale) => sale.payment_status === 'paid');
    const pendingSales = periodSales.filter((sale) => sale.payment_status === 'pending');
    const lostSales = periodSales.filter((sale) => sale.payment_status === 'lost');
    const periodCost = periodSales.reduce((sum, sale) => sum
      + (sale.sale_items || []).reduce((itemSum, item) => itemSum + number(item.cost_total), 0), 0);
    const periodExpenses = data.expenses
      .filter((expense) => withinPeriod(expense.expense_date))
      .reduce((sum, expense) => sum + number(expense.amount), 0);
    const periodAdditionalIncome = data.additionalIncomes
      .filter((income) => withinPeriod(income.income_date))
      .reduce((sum, income) => sum + number(income.amount), 0);
    const periodBadDebt = data.sales
      .filter((sale) => sale.status === 'issued' && sale.payment_status === 'lost'
        && withinPeriod(sale.written_off_at?.slice(0, 10)))
      .reduce((sum, sale) => sum + number(sale.total), 0);
    const openingDate = data.financeSettings?.opening_date || today;
    const afterOpening = (date) => Boolean(date && date >= openingDate);
    const loansAfterOpening = data.businessLoans.filter((loan) => loan.loan_date >= openingDate);
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
    const finishedInventory = Math.max(0, totalProductionCost - totalCostOfSales
      + data.batches.reduce((sum, batch) => sum + number(batch.inventory_adjustment) * number(batch.unit_cost), 0));
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
        .reduce((sum, expense) => sum + number(expense.amount), 0)
      + data.additionalIncomes.filter((income) => income.payment_status === 'paid'
        && afterOpening(income.income_date) && afterOpening(income.paid_at?.slice(0, 10)))
        .reduce((sum, income) => sum + number(income.amount), 0)
      - loansAfterOpening.reduce((sum, loan) => sum + number(loan.principal), 0)
      + data.loanRepayments.filter((repayment) => afterOpening(repayment.payment_date))
        .reduce((sum, repayment) => sum + number(repayment.amount), 0);
    const commercialReceivables = number(settings.opening_receivables)
      + data.sales.filter((sale) => sale.status === 'issued' && sale.payment_status === 'pending'
        && afterOpening(sale.invoice_date))
        .reduce((sum, sale) => sum + number(sale.total), 0)
      + data.additionalIncomes.filter((income) => income.payment_status === 'pending'
        && afterOpening(income.income_date))
        .reduce((sum, income) => sum + number(income.amount), 0);
    const loanReceivables = Math.max(0, data.businessLoans.reduce((sum, loan) => sum + number(loan.principal), 0)
      - data.loanRepayments.reduce((sum, repayment) => sum + number(repayment.amount), 0));
    const receivables = commercialReceivables + loanReceivables;
    const payables = number(settings.opening_payables)
      + data.purchases.filter((purchase) => purchase.payment_status === 'pending' && afterOpening(purchase.purchase_date))
        .reduce((sum, purchase) => sum + number(purchase.total), 0)
      + data.expenses.filter((expense) => expense.payment_status === 'pending' && afterOpening(expense.expense_date))
        .reduce((sum, expense) => sum + number(expense.amount), 0);
    const retainedEarnings = data.sales
      .filter((sale) => sale.status === 'issued' && afterOpening(sale.invoice_date))
      .reduce((sum, sale) => sum + number(sale.total)
        - (sale.sale_items || []).reduce((itemSum, item) => itemSum + number(item.cost_total), 0), 0)
      + data.additionalIncomes.filter((income) => afterOpening(income.income_date))
      .reduce((sum, income) => sum + number(income.amount), 0)
      - data.sales.filter((sale) => sale.status === 'issued' && sale.payment_status === 'lost'
        && afterOpening(sale.written_off_at?.slice(0, 10)))
        .reduce((sum, sale) => sum + number(sale.total), 0)
      - data.expenses.filter((expense) => afterOpening(expense.expense_date))
        .reduce((sum, expense) => sum + number(expense.amount), 0);
    const assets = cash + receivables + rawInventory + indirectInventory + finishedInventory;
    const equity = number(settings.opening_equity) + retainedEarnings;
    return {
      periodSales,
      paidSales: paidSales.reduce((sum, sale) => sum + number(sale.total), 0),
      paidSalesCount: paidSales.length,
      pendingSales: pendingSales.reduce((sum, sale) => sum + number(sale.total), 0),
      pendingSalesCount: pendingSales.length,
      lostSales: lostSales.reduce((sum, sale) => sum + number(sale.total), 0),
      lostSalesCount: lostSales.length,
      revenue: periodRevenue,
      additionalIncome: periodAdditionalIncome,
      cost: periodCost,
      grossProfit: periodRevenue - periodCost,
      expenses: periodExpenses,
      badDebt: periodBadDebt,
      netIncome: periodRevenue + periodAdditionalIncome - periodCost - periodExpenses - periodBadDebt,
      loanDisbursements: data.businessLoans.filter((loan) => withinPeriod(loan.loan_date))
        .reduce((sum, loan) => sum + number(loan.principal), 0),
      loanRepayments: data.loanRepayments.filter((repayment) => withinPeriod(repayment.payment_date))
        .reduce((sum, repayment) => sum + number(repayment.amount), 0),
      cash,
      receivables,
      commercialReceivables,
      loanReceivables,
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

  const dashboardStats = useMemo(() => {
    const monthKey = today.slice(0, 7);
    const assignedBatches = new Map(data.webProducts.flatMap((product) => getWebProductBatches(product))
      .map((batch) => [batch.id, batch]));
    const monthSales = data.sales.filter((sale) => (
      sale.status === 'issued' && sale.invoice_date?.startsWith(monthKey)
    ));
    const monthRevenue = monthSales.reduce((sum, sale) => sum + number(sale.total), 0);
    const monthCost = monthSales.reduce((sum, sale) => sum
      + (sale.sale_items || []).reduce((itemsSum, item) => itemsSum + number(item.cost_total), 0), 0);
    const monthExpenses = data.expenses
      .filter((expense) => expense.expense_date?.startsWith(monthKey))
      .reduce((sum, expense) => sum + number(expense.amount), 0);
    const monthAdditionalIncome = data.additionalIncomes
      .filter((income) => income.income_date?.startsWith(monthKey))
      .reduce((sum, income) => sum + number(income.amount), 0);
    const monthBadDebt = data.sales
      .filter((sale) => sale.payment_status === 'lost' && sale.written_off_at?.startsWith(monthKey))
      .reduce((sum, sale) => sum + number(sale.total), 0);
    const monthlyTrend = Array.from({ length: 6 }, (_, index) => {
      const month = new Date();
      month.setDate(1);
      month.setMonth(month.getMonth() - (5 - index));
      const key = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
      const revenue = data.sales.filter((sale) => sale.status === 'issued' && sale.invoice_date?.startsWith(key))
        .reduce((sum, sale) => sum + number(sale.total), 0);
      const expenses = data.expenses.filter((expense) => expense.expense_date?.startsWith(key))
        .reduce((sum, expense) => sum + number(expense.amount), 0);
      return {
        key,
        label: new Intl.DateTimeFormat('es-HN', { month: 'short' }).format(month),
        revenue,
        expenses,
      };
    });
    const alertCount = data.materials.filter((item) => item.initial + item.purchased - item.used <= item.min).length
      + data.indirects.filter((item) => item.stock <= item.minimumStock).length;
    const producedThisMonth = data.batches.filter((batch) => batch.batch_date?.startsWith(monthKey))
      .reduce((sum, batch) => sum + number(batch.quantity), 0);
    return {
      monthRevenue,
      monthExpenses,
      monthNet: monthRevenue + monthAdditionalIncome - monthCost - monthExpenses - monthBadDebt,
      monthSalesCount: monthSales.length,
      producedThisMonth,
      alertCount,
      availableStock: [...assignedBatches.values()].reduce((sum, batch) => sum + availableWebBatchStock(batch), 0),
      receivables: reports.receivables,
      cash: reports.cash,
      loanBalance: reports.loanReceivables,
      pendingWebOrders: activeWebOrderCount,
      potentialOrderValue: potentialCustomOrderIncome,
      monthlyTrend,
      trendMax: Math.max(1, ...monthlyTrend.flatMap((month) => [month.revenue, month.expenses])),
    };
  }, [activeWebOrderCount, data, potentialCustomOrderIncome, reports]);

  const calendarDays = useMemo(() => {
    const first = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1, 12);
    const mondayOffset = (first.getDay() + 6) % 7;
    const gridStart = new Date(first);
    gridStart.setDate(first.getDate() - mondayOffset);
    return Array.from({ length: 42 }, (_, index) => {
      const day = new Date(gridStart);
      day.setDate(gridStart.getDate() + index);
      const key = dateKey(day);
      return {
        key,
        day,
        inMonth: day.getMonth() === calendarMonth.getMonth(),
        events: data.promotionEvents.filter((event) => event.event_date === key),
      };
    });
  }, [calendarMonth, data.promotionEvents]);
  const selectedDayEvents = useMemo(() => data.promotionEvents
    .filter((event) => event.event_date === selectedCalendarDate)
    .sort((a, b) => String(a.activity).localeCompare(String(b.activity), 'es')),
  [data.promotionEvents, selectedCalendarDate]);

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
      .reduce((sum, item) => sum + number(item.quantity), 0)
      + data.manualReservations.filter((reservation) => reservation.status === 'active')
        .flatMap((reservation) => reservation.batch_allocations || [])
        .filter((allocation) => data.batches.find((batch) => batch.id === allocation.batch_id)?.recipe_id === recipeId)
        .reduce((sum, allocation) => sum + number(allocation.quantity), 0);
    return produced - sold - reserved;
  }

  function getWebProductBatches(product) {
    return (product.web_product_batches || [])
      .map((link) => data.batches.find((batch) => batch.id === link.batch_id))
      .filter(Boolean);
  }

  function getWebProductRecipe(product) {
    const batches = getWebProductBatches(product)
      .sort((a, b) => String(a.batch_date).localeCompare(String(b.batch_date))
        || String(a.created_at).localeCompare(String(b.created_at))
        || String(a.id).localeCompare(String(b.id)));
    const recipeIds = [...new Set(batches.map((batch) => batch.recipe_id))];
    return recipeIds.map((id) => data.recipes.find((recipeItem) => recipeItem.id === id)).find(Boolean) || null;
  }

  function availableWebBatchStock(batch) {
    const batchStock = number(batch.quantity) + number(batch.inventory_adjustment);
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
      .reduce((sum, item) => sum + number(item.quantity), 0)
      + data.manualReservations.filter((reservation) => reservation.status === 'active')
        .flatMap((reservation) => reservation.batch_allocations || [])
        .filter((allocation) => allocation.batch_id === batch.id)
        .reduce((sum, allocation) => sum + number(allocation.quantity), 0);
    const earlierFree = recipeBatches
      .slice(0, recipeBatches.findIndex((item) => item.id === batch.id))
      .reduce((sum, item) => {
        const reserved = data.webOrders
          .filter((order) => order.status === 'confirmed')
          .flatMap((order) => order.web_order_items || [])
          .filter((orderItem) => orderItem.batch_id === item.id)
          .reduce((total, orderItem) => total + number(orderItem.quantity), 0)
          + data.manualReservations.filter((reservation) => reservation.status === 'active')
            .flatMap((reservation) => reservation.batch_allocations || [])
            .filter((allocation) => allocation.batch_id === item.id)
            .reduce((total, allocation) => total + number(allocation.quantity), 0);
        return sum + Math.max(0, number(item.quantity) + number(item.inventory_adjustment) - reserved);
      }, 0);
    const soldHere = Math.min(
      Math.max(0, batchStock - reservedForBatch),
      Math.max(0, sold - earlierFree),
    );
    return Math.max(0, batchStock - reservedForBatch - soldHere);
  }

  function reservedWebBatchStock(batch) {
    return data.webOrders
      .filter((order) => order.status === 'confirmed')
      .flatMap((order) => order.web_order_items || [])
      .filter((item) => item.batch_id === batch.id)
      .reduce((sum, item) => sum + number(item.quantity), 0)
      + data.manualReservations
        .filter((reservation) => reservation.status === 'active')
        .flatMap((reservation) => reservation.batch_allocations || [])
        .filter((allocation) => allocation.batch_id === batch.id)
        .reduce((sum, allocation) => sum + number(allocation.quantity), 0);
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
      normalPrice: product.normal_price == null ? '' : String(product.normal_price),
      promotionPrice: product.promotion_price == null ? '' : String(product.promotion_price),
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
      normalPrice: '',
      promotionPrice: '',
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
    if ([webProductDraft.normalPrice, webProductDraft.promotionPrice].some((price) => (
      price === '' || !Number.isFinite(Number(price)) || Number(price) < 0
    ))) {
      toast('Ingresa un precio normal y un precio promocional válidos.', 'error');
      return;
    }
    let uploadedPath = null;
    try {
      uploadedPath = await uploadWebImage(webProductFile, 'products');
      const { error: saveError } = await supabase.from('web_products').upsert({
        id: webProductDraft.id || undefined,
        name: webProductDraft.name.trim(),
        normal_price: number(webProductDraft.normalPrice),
        promotion_price: number(webProductDraft.promotionPrice),
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

  async function saveCustomOrder(event) {
    event.preventDefault();
    const values = modal?.values;
    if (!values) return;
    if (![values.customerName, values.customerPhone, values.design, values.fragrance, values.color]
      .every((value) => value.trim()) || !Number.isInteger(number(values.quantity)) || number(values.quantity) < 1
      || !Number.isFinite(Number(values.orderValue)) || number(values.orderValue) <= 0) {
      toast('Completa todos los campos, ingresa un valor mayor a cero y verifica que la cantidad sea un entero positivo.', 'error');
      return;
    }
    const orderData = {
      customer_name: values.customerName.trim(),
      customer_phone: values.customerPhone.trim(),
      design: values.design.trim(),
      fragrance: values.fragrance.trim(),
      color: values.color.trim(),
      quantity: number(values.quantity),
      order_value: number(values.orderValue),
    };
    const orderWrite = modal.orderId
      ? supabase.from('custom_orders').update(orderData).eq('id', modal.orderId)
      : supabase.from('custom_orders').insert(orderData);
    const { error: saveError } = await orderWrite.select('id').single();
    if (saveError) {
      toast(saveError.message, 'error');
      return;
    }
    setModal(null);
    toast(modal.orderId ? 'Pedido actualizado' : 'Pedido agregado');
    await loadData();
  }

  function openPromotionEvent(event = null, eventDate = selectedCalendarDate) {
    setModal({
      kind: 'promotionEvent',
      eventId: event?.id || null,
      values: {
        eventDate: event?.event_date || eventDate,
        activity: event?.activity || '',
        resources: event?.resources || '',
        objective: event?.objective || '',
      },
    });
  }

  async function savePromotionEvent(event) {
    event.preventDefault();
    const values = modal?.values;
    if (!values) return;
    if (![values.activity, values.resources, values.objective].every((value) => value.trim())) {
      toast('Completa la actividad, los recursos necesarios y el objetivo.', 'error');
      return;
    }
    const eventData = {
      event_date: values.eventDate,
      activity: values.activity.trim(),
      resources: values.resources.trim(),
      objective: values.objective.trim(),
      updated_at: new Date().toISOString(),
    };
    const eventWrite = modal.eventId
      ? supabase.from('promotion_events').update(eventData).eq('id', modal.eventId)
      : supabase.from('promotion_events').insert(eventData);
    const { error: saveError } = await eventWrite.select('id').single();
    if (saveError) {
      toast(saveError.message, 'error');
      return;
    }
    setSelectedCalendarDate(values.eventDate);
    setCalendarMonth(new Date(`${values.eventDate.slice(0, 7)}-01T12:00:00`));
    setModal(null);
    toast(modal.eventId ? 'Actividad actualizada' : 'Actividad agregada al calendario');
    await loadData();
  }

  async function deletePromotionEvent(event) {
    if (!window.confirm(`¿Eliminar la actividad "${event.activity}" del calendario?`)) return;
    const { error: deleteError } = await supabase.from('promotion_events')
      .delete()
      .eq('id', event.id)
      .select('id')
      .single();
    if (deleteError) {
      toast(deleteError.message, 'error');
      return;
    }
    toast('Actividad eliminada');
    await loadData();
  }

  async function markSaleAsLost(sale) {
    if (!window.confirm(`¿Marcar como perdida la cuenta de ${sale.customer_name} por ${money(sale.total)}? Se registrará como cuenta incobrable.`)) return;
    const { error: writeOffError } = await supabase.rpc('mark_sale_lost', { p_sale_id: sale.id });
    if (writeOffError) {
      toast(writeOffError.message, 'error');
      return;
    }
    toast('Cuenta marcada como perdida');
    await loadData();
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
      setMobileFormOpen(null);
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

  async function updateCustomOrder(order, status) {
    const { error: orderError } = await supabase.from('custom_orders')
      .update({ status })
      .eq('id', order.id)
      .select('id')
      .single();
    if (orderError) {
      toast(orderError.message, 'error');
      return;
    }
    toast('Estado del pedido personalizado actualizado');
    await loadData();
  }

  async function updateCollectionReminder(reminder, status) {
    const { error: reminderError } = await supabase.from('collection_reminders')
      .update({ status })
      .eq('id', reminder.id)
      .select('id')
      .single();
    if (reminderError) {
      toast(reminderError.message, 'error');
      return;
    }
    toast(status === 'done' ? 'Recordatorio marcado como atendido' : 'Recordatorio reactivado');
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
    if (!window.confirm(`¿Eliminar el lote ${batch.code}? Los pedidos y las reservaciones activos relacionados se cancelarán; el historial se conservará y el producto web mantendrá sus otros lotes asignados.`)) return;
    const { data: cancelledOrders, error: deleteError } = await supabase.rpc('delete_batch', {
      p_batch_id: batch.id,
    });
    if (deleteError) {
      toast(deleteError.message, 'error');
      return;
    }
    const count = Number(cancelledOrders || 0);
    toast(`Lote eliminado; ${count} pedido${count === 1 ? '' : 's'} o reservación${count === 1 ? '' : 'es'} cancelado${count === 1 ? '' : 's'}. El historial se conservó.`);
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
    openMobileForm('recipe');
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
    openMobileForm('recipe');
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
    openMobileForm('recipe');
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
    setMobileFormOpen(null);
    toast('Receta guardada');
    await loadData();
  }

  async function produceBatch(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const webProductId = String(form.get('webProductId') || '');
    const { error: produceError } = await supabase.rpc('produce_batch', {
      p_recipe_id: form.get('recipeId'),
      p_code: String(form.get('code')).trim(),
      p_quantity: number(form.get('quantity')),
      p_web_product_id: webProductId || null,
    });
    if (produceError) {
      toast(produceError.message, 'error');
      return;
    }
    setModal(null);
    const linkedProduct = data.webProducts.find((product) => product.id === webProductId);
    toast(linkedProduct
      ? `Lote agregado a ${linkedProduct.name}; existencias sumadas`
      : 'Lote registrado y existencias actualizadas');
    await loadData();
  }

  function openSalesOrder(sale = null, defaultPaymentStatus = 'paid') {
    setSaleDraft(sale
      ? {
        id: sale.id,
        customerName: sale.customer_name === 'Cliente general' ? '' : sale.customer_name,
        customerPhone: sale.customer_phone || '',
        paymentMethod: sale.payment_method,
        paymentStatus: sale.payment_status,
        items: (sale.sale_items || []).map((item) => ({
          webProductId: (saleProducts.find(({ product, recipe }) => recipe.id === item.recipe_id
            && product.name === item.recipe_name)
            || saleProducts.find(({ recipe }) => recipe.id === item.recipe_id))?.product.id || '',
          quantity: String(item.quantity),
        })),
      }
      : {
        id: '',
        customerName: '',
        customerPhone: '',
        paymentMethod: 'cash',
        paymentStatus: defaultPaymentStatus,
        items: [{ webProductId: '', quantity: '1' }],
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
    const values = modal?.values;
    if (!values) return;
    const expense = {
      description: values.description.trim(),
      category: values.category.trim(),
      amount: number(values.amount),
      expense_date: values.expenseDate,
      payment_status: values.paymentStatus,
      payment_method: values.paymentMethod,
      paid_at: values.paymentStatus === 'paid' ? (values.paidAt || new Date().toISOString()) : null,
    };
    const expenseWrite = modal.expenseId
      ? supabase.from('expenses').update(expense).eq('id', modal.expenseId)
      : supabase.from('expenses').insert(expense);
    const { error: expenseError } = await expenseWrite.select('id').single();
    if (expenseError) {
      toast(expenseError.message, 'error');
      return;
    }
    setModal(null);
    toast(modal.expenseId ? 'Gasto actualizado' : 'Gasto registrado');
    await loadData();
  }

  function openExpenseForm(expense = null) {
    setModal({
      kind: 'expense',
      expenseId: expense?.id || null,
      values: {
        description: expense?.description || '',
        category: expense?.category || '',
        amount: expense ? String(expense.amount) : '',
        expenseDate: expense?.expense_date || today,
        paymentStatus: expense?.payment_status || 'paid',
        paymentMethod: expense?.payment_method || 'cash',
        paidAt: expense?.paid_at || '',
      },
    });
  }

  async function deleteExpense(expense) {
    if (!window.confirm(`¿Eliminar el gasto "${expense.description}" por ${money(expense.amount)}?`)) return;
    const { error: deleteError } = await supabase.from('expenses').delete().eq('id', expense.id).select('id').single();
    if (deleteError) {
      toast(deleteError.message, 'error');
      return;
    }
    toast('Gasto eliminado');
    await loadData();
  }

  async function saveCollectionReminder(event) {
    event.preventDefault();
    const { error: reminderError } = await supabase.from('collection_reminders').insert({
      customer_name: collectionReminderForm.customerName.trim(),
      customer_phone: collectionReminderForm.customerPhone.trim() || null,
      concept: collectionReminderForm.concept.trim(),
      amount: number(collectionReminderForm.amount),
      due_date: collectionReminderForm.dueDate,
    });
    if (reminderError) {
      toast(reminderError.message, 'error');
      return;
    }
    setCollectionReminderForm({ customerName: '', customerPhone: '', concept: '', amount: '', dueDate: today });
    setModal(null);
    toast('Recordatorio de cobro agregado');
    await loadData();
  }

  async function saveManualReservation(event) {
    event.preventDefault();
    const values = modal?.values;
    if (!values) return;
    const { error: reservationError } = await supabase.rpc('reserve_manual_product', {
      p_web_product_id: values.productId,
      p_customer_name: values.customerName.trim(),
      p_customer_phone: values.customerPhone.trim() || null,
      p_quantity: number(values.quantity),
      p_reservation_date: values.reservationDate,
    });
    if (reservationError) {
      toast(reservationError.message, 'error');
      return;
    }
    setModal(null);
    toast('Reservación guardada y stock apartado');
    await loadData();
  }

  async function cancelManualReservation(reservation) {
    if (!window.confirm(`¿Cancelar la reservación de ${reservation.product_name}? Se liberarán ${reservation.quantity} unidades.`)) return;
    const { error: cancelError } = await supabase.from('manual_reservations')
      .update({ status: 'cancelled' })
      .eq('id', reservation.id)
      .eq('status', 'active')
      .select('id')
      .single();
    if (cancelError) {
      toast(cancelError.message, 'error');
      return;
    }
    toast('Reservación cancelada; el stock fue liberado');
    await loadData();
  }

  async function saveBusinessLoan(event) {
    event.preventDefault();
    const values = modal?.values;
    if (!values) return;
    const { error: loanError } = await supabase.from('business_loans').insert({
      description: values.description.trim(),
      principal: number(values.principal),
      loan_date: values.loanDate,
    });
    if (loanError) {
      toast(loanError.message, 'error');
      return;
    }
    setModal(null);
    toast('Préstamo registrado como cuenta por cobrar');
    await loadData();
  }

  async function saveLoanRepayment(event) {
    event.preventDefault();
    const values = modal?.values;
    if (!values) return;
    const { error: repaymentError } = await supabase.rpc('repay_business_loan', {
      p_business_loan_id: modal.loan.id,
      p_amount: number(values.amount),
      p_payment_date: values.paymentDate,
    });
    if (repaymentError) {
      toast(repaymentError.message, 'error');
      return;
    }
    setModal(null);
    toast('Abono registrado y saldo actualizado');
    await loadData();
  }

  async function deleteBusinessLoan(loan) {
    if (loan.repaid > 0) {
      toast('No se puede eliminar un préstamo con abonos registrados.', 'error');
      return;
    }
    if (!window.confirm(`¿Eliminar el préstamo "${loan.description}" por ${money(loan.principal)}?`)) return;
    const { error: deleteError } = await supabase.from('business_loans').delete().eq('id', loan.id).select('id').single();
    if (deleteError) {
      toast(deleteError.message, 'error');
      return;
    }
    toast('Préstamo eliminado');
    await loadData();
  }

  async function saveAdditionalIncome(event) {
    event.preventDefault();
    const { error: incomeError } = await supabase.from('additional_incomes').insert({
      concept: additionalIncomeForm.concept.trim(),
      amount: number(additionalIncomeForm.amount),
      income_date: additionalIncomeForm.incomeDate,
      payment_status: additionalIncomeForm.paymentStatus,
      payment_method: additionalIncomeForm.paymentMethod,
      paid_at: additionalIncomeForm.paymentStatus === 'paid' ? new Date().toISOString() : null,
    });
    if (incomeError) {
      toast(incomeError.message, 'error');
      return;
    }

    setAdditionalIncomeForm({
      concept: '',
      amount: '',
      incomeDate: today,
      paymentStatus: 'paid',
      paymentMethod: 'cash',
    });
    setMobileFormOpen(null);
    toast('Ingreso adicional registrado');
    await loadData();
  }

  async function installApp() {
    if (!installPrompt) return;
    try {
      await installPrompt.prompt();
      setInstallPrompt(null);
    } catch (installError) {
      toast(installError.message || 'No se pudo iniciar la instalación.', 'error');
    }
  }

  async function markAdditionalIncomePaid(income) {
    const { error: paymentError } = await supabase.from('additional_incomes')
      .update({ payment_status: 'paid', paid_at: new Date().toISOString() })
      .eq('id', income.id)
      .eq('payment_status', 'pending')
      .select('id')
      .single();
    if (paymentError) {
      toast(paymentError.message, 'error');
      return;
    }
    toast('Ingreso adicional cobrado');
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
    setMobileFormOpen(null);
    toast('Saldos iniciales guardados');
    await loadData();
  }

  async function saveSalesOrder(event) {
    event.preventDefault();
    const items = saleDraft.items.map((item) => {
      const { product, recipe } = saleProducts.find(({ product: entry }) => entry.id === item.webProductId) || {};
      const priceType = recipe && priceTypes.find(([value]) => recipe.prices[value] != null)?.[0];
      return {
        product,
        recipe,
        quantity: number(item.quantity),
        priceType,
        unitPrice: number(product?.promotion_price ?? product?.normal_price),
      };
    });
    if (!items.length || items.some((item) => (
      !item.product || !item.recipe || !item.priceType || !Number.isInteger(item.quantity) || item.quantity < 1
      || !Number.isFinite(item.unitPrice) || item.unitPrice < 0
    ))) {
      toast('Selecciona productos web vinculados a una receta, con precio válido, y cantidades enteras positivas.', 'error');
      return;
    }

    const { data: savedSaleId, error: saveError } = await supabase.rpc('save_sales_order', {
      p_sale_id: saleDraft.id || null,
      p_customer_name: saleDraft.customerName.trim() || null,
      p_customer_phone: saleDraft.customerPhone.trim() || null,
      p_payment_method: saleDraft.paymentMethod,
      p_payment_status: saleDraft.paymentStatus,
      p_items: items.map((item) => ({
        recipe_id: item.recipe.id,
        quantity: item.quantity,
        price_type: item.priceType,
      })),
    });
    if (saveError) {
      toast(saveError.message, 'error');
      return;
    }
    if (!savedSaleId) {
      toast('La venta se guardó, pero no se recibió su identificador para terminar de preparar el borrador.', 'error');
      return;
    }

    const { data: savedItems, error: savedItemsError } = await supabase
      .from('sale_items')
      .select('id, recipe_id, quantity, price_type')
      .eq('sale_id', savedSaleId);
    if (savedItemsError || !savedItems || savedItems.length !== items.length) {
      toast(`La venta se guardó, pero no se pudieron aplicar los nombres y precios de la tienda${savedItemsError ? `: ${savedItemsError.message}` : '.'}`, 'error');
      setSaleDraft({ ...saleDraft, id: savedSaleId });
      await loadData();
      return;
    }

    const itemQueues = new Map();
    items.forEach((item) => {
      const key = JSON.stringify([item.recipe.id, item.quantity, item.priceType]);
      itemQueues.set(key, [...(itemQueues.get(key) || []), item]);
    });
    const updates = savedItems.map((savedItem) => {
      const key = JSON.stringify([savedItem.recipe_id, savedItem.quantity, savedItem.price_type]);
      const item = itemQueues.get(key)?.shift();
      if (!item) return null;
      const lineTotal = Math.round(item.unitPrice * item.quantity * 100) / 100;
      return supabase.from('sale_items').update({
        recipe_name: item.product.name,
        unit_price: item.unitPrice,
        line_total: lineTotal,
      }).eq('id', savedItem.id);
    });
    if (updates.some((update) => !update)) {
      toast('La venta se guardó, pero no se pudieron relacionar sus productos con la tienda. Revisa el borrador antes de emitir.', 'error');
      setSaleDraft({ ...saleDraft, id: savedSaleId });
      await loadData();
      return;
    }
    const updateResults = await Promise.all(updates);
    const failedUpdate = updateResults.find(({ error: updateError }) => updateError);
    if (failedUpdate) {
      toast(`La venta se guardó, pero no se pudieron aplicar los precios de tienda: ${failedUpdate.error.message}`, 'error');
      setSaleDraft({ ...saleDraft, id: savedSaleId });
      await loadData();
      return;
    }
    const total = items.reduce((sum, item) => sum + Math.round(item.unitPrice * item.quantity * 100) / 100, 0);
    const { error: totalError } = await supabase.from('sales')
      .update({ subtotal: total, total })
      .eq('id', savedSaleId)
      .eq('status', 'draft');
    if (totalError) {
      toast(`Los precios de tienda se aplicaron, pero no se pudo actualizar el total de la venta: ${totalError.message}`, 'error');
      setSaleDraft({ ...saleDraft, id: savedSaleId });
      await loadData();
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

  async function confirmDeleteSale(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (form.get('accessCode') !== ACCESS_CODE) {
      toast('La clave de acceso no es válida.', 'error');
      return;
    }

    const sale = modal?.sale;
    if (!sale || deletingSale) return;
    setDeletingSale(true);
    const { data: deletedSale, error: deleteError } = await supabase
      .from('sales')
      .delete()
      .eq('id', sale.id)
      .eq('status', sale.status)
      .select('id')
      .maybeSingle();
    setDeletingSale(false);
    if (deleteError) {
      toast(deleteError.message, 'error');
      return;
    }
    if (!deletedSale) {
      toast('No se encontró la venta para eliminar.', 'error');
      return;
    }

    setModal(null);
    toast(sale.status === 'issued'
      ? 'Factura eliminada; el inventario disponible se actualizó.'
      : 'Borrador eliminado.');
    await loadData();
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
      const optionalCategories = [
        'sales', 'purchases', 'expenses', 'customOrders', 'additionalIncomes', 'collectionReminders',
        'businessLoans', 'loanRepayments', 'promotionEvents',
      ];
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
            paid_at: sale.paid_at || (status === 'issued' && sale.payment_status === 'paid' ? sale.issued_at : null),
            written_off_at: sale.written_off_at || null,
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

      for (const loan of backup.businessLoans || []) {
        const { error: loanError } = await supabase.from('business_loans').upsert({
          id: loan.id,
          owner_id: session.user.id,
          description: loan.description,
          principal: number(loan.principal),
          loan_date: loan.loan_date,
          created_at: loan.created_at,
        }, { onConflict: 'id' });
        if (loanError) throw loanError;
      }

      for (const repayment of backup.loanRepayments || []) {
        const { error: repaymentError } = await supabase.from('business_loan_repayments').upsert({
          id: repayment.id,
          owner_id: session.user.id,
          business_loan_id: repayment.business_loan_id,
          amount: number(repayment.amount),
          payment_date: repayment.payment_date,
          created_at: repayment.created_at,
        }, { onConflict: 'id' });
        if (repaymentError) throw repaymentError;
      }

      for (const order of backup.customOrders || []) {
        const { error: orderError } = await supabase.from('custom_orders').upsert({
          id: order.id,
          owner_id: session.user.id,
          customer_name: order.customer_name,
          customer_phone: order.customer_phone,
          design: order.design,
          fragrance: order.fragrance,
          color: order.color,
          quantity: number(order.quantity),
          order_value: number(order.order_value),
          status: order.status || 'pending',
          created_at: order.created_at,
        }, { onConflict: 'id' });
        if (orderError) throw orderError;
      }

      for (const promotionEvent of backup.promotionEvents || []) {
        const { error: eventError } = await supabase.from('promotion_events').upsert({
          id: promotionEvent.id,
          owner_id: session.user.id,
          event_date: promotionEvent.event_date,
          activity: promotionEvent.activity,
          resources: promotionEvent.resources || '',
          objective: promotionEvent.objective || '',
          created_at: promotionEvent.created_at,
          updated_at: promotionEvent.updated_at,
        }, { onConflict: 'id' });
        if (eventError) throw eventError;
      }

      for (const income of backup.additionalIncomes || []) {
        const { error: incomeError } = await supabase.from('additional_incomes').upsert({
          id: income.id,
          owner_id: session.user.id,
          concept: income.concept,
          amount: number(income.amount),
          income_date: income.income_date,
          payment_status: income.payment_status,
          payment_method: income.payment_method,
          paid_at: income.paid_at,
          created_at: income.created_at,
        }, { onConflict: 'id' });
        if (incomeError) throw incomeError;
      }

      for (const reminder of backup.collectionReminders || []) {
        const { error: reminderError } = await supabase.from('collection_reminders').upsert({
          id: reminder.id,
          owner_id: session.user.id,
          customer_name: reminder.customer_name,
          customer_phone: reminder.customer_phone,
          concept: reminder.concept,
          amount: number(reminder.amount),
          due_date: reminder.due_date,
          status: reminder.status,
          created_at: reminder.created_at,
        }, { onConflict: 'id' });
        if (reminderError) throw reminderError;
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

  const brandLogoUrl = data.webSettings?.logo_path
    ? supabase.storage.from('jabon').getPublicUrl(data.webSettings.logo_path).data.publicUrl
    : null;

  if (authLoading) return <div className="loading-screen">Cargando Fragancia y Miel…</div>;
  if (!isSupabaseConfigured) return <div className="center-screen"><Notice type="error">{error}</Notice></div>;
  if (!unlocked || !session) {
    return (
      <div className="auth-page" data-theme={theme}>
        <div className="auth-card">
          <div className="brand-mark">
            {brandLogoUrl
              ? <img src={brandLogoUrl} alt={`Logo de ${data.webSettings?.business_name || 'Fragancia y Miel'}`} />
              : '✿'}
          </div>
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
    <div
      className={`app-shell nav-position-${preferences.navigationPosition}${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}
      data-theme={theme}
      style={{
        '--green': preferences.accentColor,
        '--green-dark': `color-mix(in srgb, ${preferences.accentColor} 48%, #17271d)`,
        '--green-soft': `color-mix(in srgb, ${preferences.accentColor} 13%, white)`,
        '--app-scale': preferences.fontScale,
        fontFamily: preferences.fontFamily,
      }}
    >
      <header className="topbar">
        <a className="brand" href="#" onClick={(event) => event.preventDefault()}>
          {brandLogoUrl
            ? <img className="brand-icon brand-logo" src={brandLogoUrl} alt={`Logo de ${data.webSettings?.business_name || 'Fragancia y Miel'}`} />
            : <span className="brand-icon">✿</span>}
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
          <button
            type="button"
            className="button ghost theme-toggle"
            aria-label={`Cambiar a tema ${theme === 'light' ? 'oscuro' : 'claro'}`}
            aria-pressed={theme === 'dark'}
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
          >{theme === 'light' ? '☾' : '☀'} <span>{theme === 'light' ? 'Oscuro' : 'Claro'}</span></button>
          <button className="button ghost" onClick={lockApp}>Salir</button>
        </div>
      </header>

      <div className="app-workspace">
        {mobileNavOpen && <button type="button" className="sidebar-backdrop" aria-label="Cerrar menú" onClick={() => setMobileNavOpen(false)} />}
        <aside id="primary-navigation" className={`sidebar${mobileNavOpen ? ' open' : ''}`} aria-label="Navegación principal">
          <button
            type="button"
            className="sidebar-collapse-toggle"
            aria-label={sidebarCollapsed ? 'Expandir menú' : 'Contraer menú'}
            aria-expanded={!sidebarCollapsed}
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          >{sidebarCollapsed ? '›' : '‹'}<span>{sidebarCollapsed ? 'Expandir' : 'Contraer'}</span></button>
          {navigationGroups.map((group) => (
            <section
              className={`nav-group${['header', 'bottom'].includes(preferences.navigationPosition) ? ' nav-group-horizontal' : ''}${!['header', 'bottom'].includes(preferences.navigationPosition) && collapsedNavigationGroups.has(group.label) ? ' collapsed' : ''}${['header', 'bottom'].includes(preferences.navigationPosition) && openHorizontalNavigationGroup === group.label ? ' expanded' : ''}`}
              key={group.label}
            >
              <button
                type="button"
                className="nav-group-toggle"
                aria-expanded={['header', 'bottom'].includes(preferences.navigationPosition)
                  ? openHorizontalNavigationGroup === group.label
                  : !collapsedNavigationGroups.has(group.label)}
                aria-controls={`nav-group-${group.label.toLowerCase().replaceAll(' ', '-')}`}
                onClick={() => {
                  if (['header', 'bottom'].includes(preferences.navigationPosition)) {
                    setOpenHorizontalNavigationGroup((current) => current === group.label ? null : group.label);
                  } else {
                    setCollapsedNavigationGroups((groups) => {
                      const next = new Set(groups);
                      if (next.has(group.label)) next.delete(group.label);
                      else next.add(group.label);
                      return next;
                    });
                  }
                }}
              >
                <span className="nav-group-symbol" aria-hidden="true">{group.items[0]?.[2]}</span>
                <span className="nav-group-title">{group.label}</span>
                <span className="nav-group-chevron" aria-hidden="true">⌄</span>
              </button>
              <div className="nav-group-items" id={`nav-group-${group.label.toLowerCase().replaceAll(' ', '-')}`}>
                {group.items.map(([id, title, icon]) => (
                  <button
                    type="button"
                    key={id}
                    className={`nav-item${tab === id ? ' active' : ''}`}
                    aria-current={tab === id ? 'page' : undefined}
                    title={sidebarCollapsed ? title : undefined}
                    onClick={() => {
                      setTab(id);
                      setMobileNavOpen(false);
                      setOpenHorizontalNavigationGroup(null);
                    }}
                  >
                    <span className="nav-icon">{icon}</span><span>{title}</span>
                    {id === 'webOrders' && activeWebOrderCount > 0 && (
                      <span className="nav-badge" aria-label={`${activeWebOrderCount} pedidos sin reservar`} aria-live="polite">
                        {activeWebOrderCount > 99 ? '99+' : activeWebOrderCount}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </aside>

      <main className="main-content">
        <div className="welcome-row">
          <div><p className="eyebrow">{tab === 'dashboard' ? 'RESUMEN DEL NEGOCIO' : 'PANEL DE CONTROL'}</p><h1>{tab === 'dashboard' ? 'Dashboard' : 'Tu taller, en orden.'}</h1><p className="muted">{tab === 'dashboard' ? 'Indicadores financieros, inventario y actividad del mes.' : 'Inventario, recetas y producción en un solo lugar.'}</p></div>
          <div className="welcome-actions">
            {installPrompt && <button className="button secondary" onClick={installApp}>↓ Instalar aplicación</button>}
            <button className="button primary" onClick={() => { setProductionRecipeSearch(''); setProductionRecipeId(''); setModal({ kind: 'production' }); }}>＋ Registrar producción</button>
          </div>
        </div>

        {error && <Notice type="error">{error}</Notice>}
        {loading && <div className="loading-inline">Sincronizando datos con Supabase…</div>}
        {tab === 'dashboard' && (
          <div className="dashboard-layout">
            <section className="dashboard-hero">
              <div>
                <p className="eyebrow">RESUMEN MENSUAL · {new Intl.DateTimeFormat('es-HN', { month: 'long', year: 'numeric' }).format(new Date(`${today}T12:00:00`))}</p>
                <h2>Una mirada clara a tu negocio.</h2>
                <p>Ventas, operación e inventario en un solo lugar.</p>
              </div>
              <div className="dashboard-hero-actions">
                <button className="button secondary" onClick={() => setTab('finance')}>Ver finanzas</button>
                <button className="button primary" onClick={() => { setSalesFilter('all'); setTab('sales'); }}>＋ Registrar venta</button>
              </div>
            </section>
            <section className="metrics-grid dashboard-metrics-grid">
              <Metric label="Ventas del mes" value={money(dashboardStats.monthRevenue)} detail={`${dashboardStats.monthSalesCount} facturas emitidas`} icon="↗" />
              <Metric label="Utilidad estimada" value={money(dashboardStats.monthNet)} detail="Después de costos y gastos" icon="◈" warning={dashboardStats.monthNet < 0} />
              <Metric label="Stock disponible" value={`${dashboardStats.availableStock} jabones`} detail="Inventario terminado" icon="▦" />
              <Metric label="Producción del mes" value={`${dashboardStats.producedThisMonth} jabones`} detail={`${data.batches.length} lotes registrados`} icon="▤" />
              <Metric label="Cuentas por cobrar" value={money(dashboardStats.receivables)} detail={`Préstamos incluidos · ${money(dashboardStats.loanBalance)}`} icon="＄" warning={dashboardStats.receivables > 0} />
              <Metric label="Pedidos web pendientes" value={dashboardStats.pendingWebOrders} detail={`Pedidos a crear · ${money(dashboardStats.potentialOrderValue)} potencial`} icon="◷" warning={dashboardStats.pendingWebOrders > 0} />
            </section>
            <div className="dashboard-content-grid">
              <Section title="Ventas y gastos" subtitle="Tendencia de los últimos seis meses">
                <div className="dashboard-chart-legend">
                  <span><i className="chart-dot revenue" /> Ventas</span>
                  <span><i className="chart-dot expenses" /> Gastos</span>
                </div>
                <div className="dashboard-chart" role="img" aria-label="Gráfico de ventas y gastos mensuales">
                  {dashboardStats.monthlyTrend.map((month) => (
                    <div className="dashboard-chart-month" key={month.key}>
                      <div className="dashboard-chart-bars">
                        <span className="dashboard-bar revenue" title={`Ventas ${money(month.revenue)}`} style={{ height: `${Math.max(3, month.revenue / dashboardStats.trendMax * 100)}%` }} />
                        <span className="dashboard-bar expenses" title={`Gastos ${money(month.expenses)}`} style={{ height: `${Math.max(3, month.expenses / dashboardStats.trendMax * 100)}%` }} />
                      </div>
                      <small>{month.label}</small>
                      <span className="dashboard-chart-value">{money(month.revenue)}</span>
                    </div>
                  ))}
                </div>
              </Section>
              <Section title="Pulso del negocio" subtitle="Saldos y puntos que requieren atención">
                <div className="dashboard-business-list">
                  <div><span>Efectivo y bancos</span><strong>{money(dashboardStats.cash)}</strong></div>
                  <div><span>Préstamos por devolver</span><strong>{money(dashboardStats.loanBalance)}</strong></div>
                  <div><span>Ingreso potencial de pedidos</span><strong>{money(dashboardStats.potentialOrderValue)}</strong></div>
                  <div className={dashboardStats.alertCount ? 'dashboard-alert' : ''}>
                    <span>Alertas de inventario</span><strong>{dashboardStats.alertCount}</strong>
                  </div>
                </div>
                <div className="dashboard-shortcuts">
                  <button type="button" onClick={() => setTab('materials')}>Revisar insumos <span>→</span></button>
                  <button type="button" onClick={() => setTab('loans')}>Administrar préstamos <span>→</span></button>
                  <button type="button" onClick={() => setTab('marketing')}>Planificar promoción <span>→</span></button>
                </div>
              </Section>
            </div>
            <Section
              title="Agenda de promoción"
              subtitle="Próximas actividades para impulsar las ventas"
              action="＋ Agregar actividad"
              onAction={() => { setSelectedCalendarDate(today); openPromotionEvent(null, today); }}
            >
              <div className="dashboard-agenda">
                {data.promotionEvents.filter((event) => event.event_date >= today).slice(0, 4).map((event) => (
                  <button type="button" className="dashboard-agenda-item" key={event.id} onClick={() => { setTab('marketing'); setSelectedCalendarDate(event.event_date); }}>
                    <span>{new Date(`${event.event_date}T12:00:00`).toLocaleDateString('es-HN', { day: 'numeric', month: 'short' })}</span>
                    <strong>{event.activity}</strong>
                    <small>{event.objective}</small>
                  </button>
                ))}
                {data.promotionEvents.filter((event) => event.event_date >= today).length === 0 && (
                  <p className="dashboard-agenda-empty">Todavía no hay actividades planificadas. Agrega una para organizar tu próxima promoción.</p>
                )}
              </div>
            </Section>
          </div>
        )}
        {tab === 'settings' && (
          <div className="settings-layout">
            <Section title="Apariencia de la aplicación" subtitle="Tus preferencias se guardan en este navegador y solo afectan esta instalación">
              <div className="settings-content">
                <div className="settings-control">
                  <div><h3>Tema</h3><p>Elige el modo de color de la aplicación.</p></div>
                  <div className="settings-choice-row">
                    {[
                      ['light', 'Claro', '☀'],
                      ['dark', 'Oscuro', '☾'],
                    ].map(([value, label, icon]) => (
                      <button type="button" key={value} className={`settings-choice${theme === value ? ' active' : ''}`} aria-pressed={theme === value} onClick={() => setTheme(value)}>
                        <span>{icon}</span>{label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="settings-control settings-color-control">
                  <div><h3>Color de la aplicación</h3><p>Personaliza el color de énfasis, botones e indicadores.</p></div>
                  <div className="settings-palette">
                    {accentPresets.map(([color, label]) => (
                      <button
                        type="button"
                        key={color}
                        className={`settings-color-choice${preferences.accentColor === color ? ' active' : ''}`}
                        style={{ '--swatch-color': color }}
                        aria-label={`Usar tema ${label}`}
                        aria-pressed={preferences.accentColor === color}
                        onClick={() => setPreferences({ ...preferences, accentColor: color })}
                      ><span />{label}</button>
                    ))}
                    <label className="settings-custom-color">
                      <span>Color personalizado</span>
                      <input type="color" value={preferences.accentColor} aria-label="Elegir color personalizado" onChange={(event) => setPreferences({ ...preferences, accentColor: event.target.value })} />
                    </label>
                  </div>
                </div>
                <div className="settings-control settings-form-control">
                  <div><h3>Tipografía</h3><p>Selecciona una fuente para leer y trabajar.</p></div>
                  <label className="settings-select">
                    <span>Tipo de letra</span>
                    <select value={preferences.fontFamily} onChange={(event) => setPreferences({ ...preferences, fontFamily: event.target.value })}>
                      {fontOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                  <label className="settings-select">
                    <span>Tamaño de letra</span>
                    <select value={preferences.fontScale} onChange={(event) => setPreferences({ ...preferences, fontScale: Number(event.target.value) })}>
                      <option value="0.9">Pequeño</option>
                      <option value="1">Mediano</option>
                      <option value="1.1">Grande</option>
                      <option value="1.2">Muy grande</option>
                    </select>
                  </label>
                </div>
                <div className="settings-control settings-position-control">
                  <div><h3>Posición del menú</h3><p>Elige dónde quieres acceder a las secciones de la aplicación.</p></div>
                  <div className="settings-position-grid">
                    {navigationPositions.map(([value, label]) => (
                      <button type="button" key={value} className={`settings-position-choice${preferences.navigationPosition === value ? ' active' : ''}`} aria-pressed={preferences.navigationPosition === value} onClick={() => setPreferences({ ...preferences, navigationPosition: value })}>
                        <span className={`settings-position-preview ${value}`}><i /></span>
                        <strong>{label}</strong>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="settings-preview">
                  <div><p className="eyebrow">VISTA PREVIA</p><h3>Tu espacio, a tu manera.</h3><p>Las preferencias se conservan aunque cierres o actualices la aplicación.</p></div>
                  <span className="settings-preview-mark">✿</span>
                </div>
                <div className="settings-footer">
                  <span>Guardado automáticamente en el almacenamiento local de este navegador.</span>
                  <button type="button" className="button secondary" onClick={() => { setPreferences(defaultPreferences); setTheme('light'); toast('Apariencia restablecida'); }}>Restablecer apariencia</button>
                </div>
              </div>
            </Section>
          </div>
        )}
        {tab === 'marketing' && (
          <div className="marketing-layout">
            <Section
              title="Trabajo de venta y promoción"
              subtitle="Organiza las acciones comerciales y los recursos que necesitas cada día"
              action="＋ Planificar actividad"
              onAction={() => openPromotionEvent(null, selectedCalendarDate)}
            >
              <div className="calendar-toolbar">
                <div>
                  <p className="eyebrow">CALENDARIO COMERCIAL</p>
                  <h3>{new Intl.DateTimeFormat('es-HN', { month: 'long', year: 'numeric' }).format(calendarMonth)}</h3>
                </div>
                <div className="calendar-toolbar-actions">
                  <button type="button" className="button secondary small" onClick={() => { setCalendarMonth(new Date(`${today.slice(0, 7)}-01T12:00:00`)); setSelectedCalendarDate(today); }}>Hoy</button>
                  <button type="button" className="icon-button calendar-step" aria-label="Mes anterior" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1, 12))}>‹</button>
                  <button type="button" className="icon-button calendar-step" aria-label="Mes siguiente" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1, 12))}>›</button>
                </div>
              </div>
              <div className="promotion-calendar">
                {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((day) => <div className="calendar-weekday" key={day}>{day}</div>)}
                {calendarDays.map(({ key, day, inMonth, events }) => (
                  <button
                    type="button"
                    key={key}
                    className={`calendar-day${inMonth ? '' : ' outside'}${selectedCalendarDate === key ? ' selected' : ''}${key === today ? ' today' : ''}${events.length ? ' has-events' : ''}`}
                    aria-label={`${day.toLocaleDateString('es-HN', { day: 'numeric', month: 'long', year: 'numeric' })}${events.length ? `, ${events.length} ${events.length === 1 ? 'actividad' : 'actividades'}` : ''}`}
                    aria-pressed={selectedCalendarDate === key}
                    onClick={() => setSelectedCalendarDate(key)}
                  >
                    <span className="calendar-day-number">{day.getDate()}</span>
                    {events.slice(0, 2).map((event) => <span className="calendar-event-chip" key={event.id}>{event.activity}</span>)}
                    {events.length > 2 && <span className="calendar-more">+{events.length - 2} más</span>}
                    {!events.length && inMonth && <span className="calendar-day-empty">·</span>}
                  </button>
                ))}
              </div>
            </Section>
            <Section
              title={`Agenda · ${new Date(`${selectedCalendarDate}T12:00:00`).toLocaleDateString('es-HN', { weekday: 'long', day: 'numeric', month: 'long' })}`}
              subtitle={`${selectedDayEvents.length} ${selectedDayEvents.length === 1 ? 'actividad planificada' : 'actividades planificadas'}`}
              action="＋ Agregar actividad"
              onAction={() => openPromotionEvent(null, selectedCalendarDate)}
            >
              <div className="promotion-agenda">
                {selectedDayEvents.map((event) => (
                  <article className="promotion-event-card" key={event.id}>
                    <div className="promotion-event-date"><span>ACTIVIDAD</span><strong>{event.activity}</strong></div>
                    <div className="promotion-event-details">
                      <p><span>Recursos necesarios</span>{event.resources || 'Sin recursos especificados'}</p>
                      <p><span>Objetivo</span>{event.objective || 'Sin objetivo especificado'}</p>
                    </div>
                    <div className="promotion-event-actions">
                      <button type="button" className="icon-button" aria-label={`Editar ${event.activity}`} title="Editar actividad" onClick={() => openPromotionEvent(event)}>✎</button>
                      <button type="button" className="icon-button danger-text" aria-label={`Eliminar ${event.activity}`} title="Eliminar actividad" onClick={() => deletePromotionEvent(event)}>×</button>
                    </div>
                  </article>
                ))}
                {selectedDayEvents.length === 0 && (
                  <div className="calendar-empty">
                    <span>◷</span><strong>Día disponible para planificar</strong>
                    <p>Agrega una actividad, sus recursos y el objetivo que quieres alcanzar.</p>
                    <button type="button" className="button secondary" onClick={() => openPromotionEvent(null, selectedCalendarDate)}>＋ Crear actividad</button>
                  </div>
                )}
              </div>
            </Section>
          </div>
        )}
        {tab === 'soapStock' && (
          <Section title="Stock de jabones" subtitle="Existencias disponibles por nombre de producto web, con detalle por lote">
            <Table headers={['Producto web', 'Receta', 'Lote', 'Fecha de producción', 'Producidos', 'Disponibles', 'Estado']}>
              {soapStockRows.map(({ product, batch, available }) => (
                <tr key={`${product.id}-${batch?.id || 'sin-lote'}`}>
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
            <div className="stock-total" aria-label="Totales de la tabla de stock">
              <span>Total producidos<strong>{soapStockTotals.produced} jabones</strong></span>
              <span>Total disponibles<strong>{soapStockTotals.available} jabones</strong></span>
            </div>
          </Section>
        )}
        {tab === 'inventoryTakes' && (
          <Section
            title="Tomas de inventario"
            subtitle="Cuenta existencias físicas, ajusta diferencias y conserva el historial en Supabase"
            action="＋ Iniciar toma"
            onAction={openInventoryTake}
          >
            <div className="inventory-take-intro">
              <span className="inventory-take-intro-icon" aria-hidden="true">▤</span>
              <div>
                <strong>Conteo guiado por categoría</strong>
                <p>Registra jabones, utensilios y materia prima. Revisa las diferencias y confirma cualquier ajuste con la clave de acceso.</p>
              </div>
            </div>
            <Table headers={['Fecha', 'Artículos contados', 'Diferencias', 'Notas', '']}>
              {data.inventoryTakes.map((take) => {
                const items = take.inventory_take_items || [];
                const changed = items.filter((item) => number(item.adjustment) !== 0).length;
                return (
                  <tr key={take.id}>
                    <td>{new Date(take.created_at).toLocaleString('es-HN', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                    <td className="strong">{items.length}</td>
                    <td><span className={`pill ${take.adjusted_at ? 'good' : changed ? 'warning' : 'good'}`}>
                      {take.adjusted_at ? 'Ajustada' : changed ? `${changed} diferencias` : 'Sin diferencias'}
                    </span></td>
                    <td>{take.notes || '—'}</td>
                    <td className="sale-actions">
                      <button type="button" className="button secondary small" onClick={() => openInventoryTakeHistory(take)}>Ver detalle</button>
                    </td>
                  </tr>
                );
              })}
            </Table>
            {!data.inventoryTakes.length && <Empty text="Todavía no hay tomas registradas. Inicia una para guardar el primer conteo." />}
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
            <Section
              title={recipe.id ? 'Editar ficha técnica' : 'Creador de receta'}
              subtitle="Define ingredientes, tamaño del lote y costos"
              className={`recipe-editor mobile-form-section${mobileFormOpen === 'recipe' ? ' mobile-form-open' : ''}`}
              action={mobileFormOpen === 'recipe' ? 'Cerrar formulario' : undefined}
              onAction={() => setMobileFormOpen(null)}
            >
              <button type="button" className="mobile-form-launcher" onClick={() => openMobileForm('recipe')}>＋ Abrir formulario de receta</button>
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
          <Section title="Historial de producción" subtitle="Lotes registrados y costos reales" action="＋ Registrar producción" onAction={() => { setProductionRecipeSearch(''); setProductionRecipeId(''); setModal({ kind: 'production' }); }}>
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
              <div className="sales-toolbar">
                <label className="sales-search">
                  <span>Buscar venta</span>
                  <input
                    type="search"
                    value={salesSearch}
                    onChange={(event) => setSalesSearch(event.target.value)}
                    placeholder="Factura, cliente o producto…"
                  />
                </label>
                <label className="sales-filter">
                  <span>Filtrar por estado</span>
                  <select value={salesFilter} onChange={(event) => setSalesFilter(event.target.value)}>
                    <option value="all">Todos los estados</option>
                    <option value="draft">Borrador</option>
                    <option value="issued">Todos los facturados</option>
                    <option value="paid">Facturado · Pagado</option>
                    <option value="pending">Facturado · Pendiente</option>
                    <option value="lost">Facturado · Incobrable</option>
                  </select>
                </label>
              </div>
              <Table headers={['N.º / venta', 'Fecha', 'Cliente', 'Unidades', 'Total', 'Estado', 'Acciones']}>
                {visibleSales.map((sale) => (
                  <tr key={sale.id}>
                    <td><code>{sale.invoice_number || `VTA-${sale.id.slice(0, 8).toUpperCase()}`}</code></td>
                    <td>{new Date(`${sale.invoice_date || sale.created_at.slice(0, 10)}T12:00:00`).toLocaleDateString('es-HN')}</td>
                    <td className="strong">{sale.customer_name}</td>
                    <td>{(sale.sale_items || []).reduce((sum, item) => sum + number(item.quantity), 0)}</td>
                    <td className="green">{money(sale.total)}</td>
                    <td><span className={`pill ${sale.status !== 'issued' ? 'warning' : sale.payment_status === 'paid' ? 'good' : sale.payment_status === 'lost' ? 'danger' : 'warning'}`}>
                      {sale.status === 'draft' ? 'Borrador' : `Facturado · ${paymentStatusLabels[sale.payment_status] || sale.payment_status}`}
                    </span></td>
                    <td className="sale-actions">
                      {sale.status === 'draft'
                        ? <>
                          <button className="icon-button" aria-label="Editar venta" title="Editar venta" onClick={() => openSalesOrder(sale)}>✎</button>
                          <button className="button primary small" onClick={() => issueSalesOrder(sale)}>Emitir factura</button>
                        </>
                        : <>
                          <button className="button secondary small" onClick={() => setModal({ kind: 'invoice', sale })}>Ver / imprimir</button>
                          {sale.payment_status === 'pending' && <>
                            <button className="button primary small" onClick={() => markAsPaid('sales', sale)}>Marcar pagada</button>
                            <button className="button secondary small" onClick={() => markSaleAsLost(sale)}>Marcar perdida</button>
                          </>}
                        </>}
                      <button
                        type="button"
                        className="icon-button danger-text"
                        aria-label={sale.status === 'issued' ? 'Eliminar factura' : 'Eliminar borrador'}
                        title={sale.status === 'issued' ? 'Eliminar factura' : 'Eliminar borrador'}
                        onClick={() => setModal({ kind: 'deleteSale', sale })}
                      >×</button>
                    </td>
                  </tr>
                ))}
                {visibleSales.length === 0 && (
                  <tr><td colSpan="7"><Empty text={data.sales.length ? 'No se encontraron ventas con esos filtros.' : 'Todavía no hay ventas registradas.'} /></td></tr>
                )}
              </Table>
            </Section>
          </div>
        )}
        {tab === 'collections' && (
          <div className="sales-page">
            <Section
              title="Cobros pendientes"
              subtitle="Lista independiente de recordatorios; no crea ni modifica ventas"
              action="＋ Registrar cobro"
              onAction={() => setModal({ kind: 'collectionReminder' })}
            >
              <div className="collection-toolbar">
                <div className="stock-total collection-total">
                  <span>Total recordado pendiente</span>
                  <strong>{money(pendingCollectionsTotal)}</strong>
                </div>
              </div>
              <div className="collection-filters" role="group" aria-label="Filtrar cobros por estado">
                {collectionFilters.map(([status, label]) => (
                  <button
                    type="button"
                    key={status}
                    className={`collection-filter${collectionFilter === status ? ' active' : ''}`}
                    aria-pressed={collectionFilter === status}
                    onClick={() => setCollectionFilter(status)}
                  >
                    {label}<span>{collectionCounts[status]}</span>
                  </button>
                ))}
              </div>
              <Table headers={['Cliente', 'Concepto', 'Importe recordado', 'Fecha', 'Estado', 'Acciones']}>
                {collectionRows.map((reminder) => (
                  <tr key={reminder.id}>
                    <td className="strong">{reminder.customer_name}<small className="table-secondary">{reminder.customer_phone || 'Sin teléfono'}</small></td>
                    <td>{reminder.concept}</td>
                    <td className="green">{money(reminder.amount)}</td>
                    <td>{new Date(`${reminder.due_date}T12:00:00`).toLocaleDateString('es-HN')}</td>
                    <td><span className={`pill ${reminder.status === 'done' ? 'good' : 'warning'}`}>{reminder.status === 'done' ? 'Atendido' : 'Pendiente'}</span></td>
                    <td className="sale-actions">
                      <button className={`button ${reminder.status === 'pending' ? 'primary' : 'secondary'} small`} onClick={() => updateCollectionReminder(reminder, reminder.status === 'pending' ? 'done' : 'pending')}>
                        {reminder.status === 'pending' ? 'Marcar atendido' : 'Reactivar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </Table>
            </Section>
          </div>
        )}
        {tab === 'expenses' && (
          <Section
            title="Gastos"
            subtitle="Registra, consulta y administra los gastos operativos del negocio"
            action="＋ Registrar gasto"
            onAction={() => openExpenseForm()}
          >
            <div className="stock-total">
              <span>{data.expenses.length} gastos registrados</span>
              <strong>{money(data.expenses.reduce((sum, expense) => sum + number(expense.amount), 0))}</strong>
            </div>
            <Table headers={['Fecha', 'Descripción', 'Categoría', 'Importe', 'Pago', 'Acciones']}>
              {data.expenses.map((expense) => (
                <tr key={expense.id}>
                  <td>{new Date(`${expense.expense_date}T12:00:00`).toLocaleDateString('es-HN')}</td>
                  <td className="strong">{expense.description}</td>
                  <td>{expense.category}</td>
                  <td className="green">{money(expense.amount)}</td>
                  <td><span className={`pill ${expense.payment_status === 'paid' ? 'good' : 'warning'}`}>{expense.payment_status === 'paid' ? 'Pagado' : 'Pendiente'}</span></td>
                  <td className="sale-actions">
                    {expense.payment_status === 'pending' && <button className="button primary small" onClick={() => markAsPaid('expenses', expense)}>Marcar pagado</button>}
                    <button className="icon-button" aria-label={`Editar gasto ${expense.description}`} title="Editar gasto" onClick={() => openExpenseForm(expense)}>✎</button>
                    <button className="icon-button danger-text" aria-label={`Eliminar gasto ${expense.description}`} title="Eliminar gasto" onClick={() => deleteExpense(expense)}>×</button>
                  </td>
                </tr>
              ))}
              {data.expenses.length === 0 && <tr><td colSpan="6"><Empty text="Todavía no hay gastos registrados." /></td></tr>}
            </Table>
          </Section>
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
        {tab === 'reservations' && (
          <Section
            title="Reservaciones"
            subtitle="Pedidos web pendientes o reservados y apartados creados manualmente"
            action="＋ Nueva reservación"
            onAction={() => setModal({
              kind: 'manualReservation',
              values: {
                productId: '',
                customerName: '',
                customerPhone: '',
                quantity: '1',
                reservationDate: today,
              },
            })}
          >
            <div className="stock-total">
              <span>{reservationRows.filter((row) => row.status === 'pending').length} pedidos pendientes y reservas activas · el inventario se aparta al reservar</span>
              <strong>{reservationRows.filter((row) => row.status === 'confirmed' || row.status === 'active').length}</strong>
            </div>
            <Table headers={['Fecha', 'Origen', 'Cliente', 'Productos', 'Unidades', 'Estado', 'Acciones']}>
              {reservationRows.map((row) => (
                <tr key={`${row.source}-${row.id}`}>
                  <td>{new Date(row.date).toLocaleDateString('es-HN')}</td>
                  <td><span className={`pill ${row.source === 'web' ? 'good' : 'warning'}`}>{row.source === 'web' ? 'Pedido web' : 'Manual'}</span></td>
                  <td className="strong">{row.customer}<small className="table-secondary">{row.phone || 'Sin teléfono'}</small></td>
                  <td>{row.product}</td>
                  <td>{row.quantity}</td>
                  <td><span className={`pill ${row.status === 'confirmed' || row.status === 'active' ? 'good' : 'warning'}`}>
                    {row.status === 'pending' ? 'Pedido pendiente' : 'Reservado'}
                  </span></td>
                  <td className="sale-actions">
                    {row.source === 'web' && <>
                      <button className="button secondary small" onClick={() => setModal({ kind: 'webOrderDetail', order: row.order })}>Ver</button>
                      {row.status === 'pending'
                        ? <button className="button primary small" onClick={() => updateWebOrder(row.order, 'confirmed')}>Reservar</button>
                        : <button className="button secondary small" onClick={() => updateWebOrder(row.order, 'cancelled')}>Liberar</button>}
                    </>}
                    {row.source === 'manual' && <button className="button secondary small" onClick={() => cancelManualReservation(row.reservation)}>Cancelar</button>}
                  </td>
                </tr>
              ))}
              {reservationRows.length === 0 && <tr><td colSpan="7"><Empty text="No hay pedidos pendientes ni reservaciones activas." /></td></tr>}
            </Table>
          </Section>
        )}
        {tab === 'webOrders' && (
          <Section title="Pedidos web" subtitle="El stock se descuenta al reservar el pedido; los pedidos pendientes no afectan las existencias">
            <div className="collection-filters order-filters" role="group" aria-label="Filtrar pedidos web por estado">
              {webOrderFilters.map(([status, label]) => (
                <button type="button" key={status} className={`collection-filter${webOrderFilter === status ? ' active' : ''}`}
                  aria-pressed={webOrderFilter === status} onClick={() => setWebOrderFilter(status)}>
                  {label}<span>{webOrderCounts[status]}</span>
                </button>
              ))}
            </div>
            <Table headers={['Pedido', 'Fecha', 'Cliente', 'Productos', 'Total', 'Estado', 'Acciones']}>
              {visibleWebOrders.map((order) => {
                const statusLabel = {
                  pending: 'Pendiente',
                  confirmed: 'Reservado',
                  cancelled: 'Rechazado',
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
                        {order.status === 'confirmed' && <button className="button primary small" onClick={() => setModal({ kind: 'completeWebOrder', order })}>Marcar entregado</button>}
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
        {tab === 'customOrders' && (
          <Section
            title="Pedidos a crear"
            subtitle="Organiza los pedidos personalizados pendientes de producción"
            action="＋ Nuevo pedido"
            onAction={() => setModal({
              kind: 'customOrder',
              values: { customerName: '', customerPhone: '', design: '', fragrance: '', color: '', quantity: '1', orderValue: '' },
            })}
          >
            <div className="stock-total">
              <span>Ingreso potencial · pedidos no rechazados</span>
              <strong>{money(potentialCustomOrderIncome)}</strong>
            </div>
            <div className="collection-filters order-filters" role="group" aria-label="Filtrar pedidos personalizados por estado">
              {customOrderFilters.map(([status, label]) => (
                <button type="button" key={status} className={`collection-filter${customOrderFilter === status ? ' active' : ''}`}
                  aria-pressed={customOrderFilter === status} onClick={() => setCustomOrderFilter(status)}>
                  {label}<span>{customOrderCounts[status]}</span>
                </button>
              ))}
            </div>
            <Table headers={['Cliente', 'Celular', 'Diseño', 'Fragancia', 'Color', 'Cantidad', 'Valor del pedido', 'Fecha', 'Estado', 'Acciones']}>
              {visibleCustomOrders.map((order) => (
                <tr key={order.id}>
                  <td className="strong">{order.customer_name}</td>
                  <td>{order.customer_phone}</td>
                  <td>{order.design}</td>
                  <td>{order.fragrance}</td>
                  <td>{order.color}</td>
                  <td className="green">{order.quantity}</td>
                  <td className="green">{money(order.order_value)}</td>
                  <td>{new Date(order.created_at).toLocaleDateString('es-HN')}</td>
                  <td><span className={`pill ${order.status === 'created' ? 'good' : order.status === 'rejected' ? 'danger' : 'warning'}`}>
                    {{ created: 'Creado', rejected: 'Rechazado', pending: 'Pendiente' }[order.status] || 'Pendiente'}
                  </span></td>
                  <td className="sale-actions">
                    <button className="icon-button" aria-label={`Editar pedido de ${order.customer_name}`} title="Editar pedido y valor" onClick={() => setModal({
                      kind: 'customOrder',
                      orderId: order.id,
                      values: {
                        customerName: order.customer_name,
                        customerPhone: order.customer_phone,
                        design: order.design,
                        fragrance: order.fragrance,
                        color: order.color,
                        quantity: String(order.quantity),
                        orderValue: String(order.order_value || ''),
                      },
                    })}>✎</button>
                    {customOrderFilters.filter(([status]) => status !== order.status).map(([status, label]) => (
                      <button key={status} className="button secondary small" onClick={() => updateCustomOrder(order, status)}>Marcar {label.toLowerCase()}</button>
                    ))}
                    <button className="icon-button danger-text" aria-label={`Eliminar pedido de ${order.customer_name}`} onClick={() => deleteRow('custom_orders', order.id, `el pedido de ${order.customer_name}`)}>×</button>
                  </td>
                </tr>
              ))}
            </Table>
          </Section>
        )}
        {tab === 'webProducts' && (
          <div className="web-admin-layout">
            <Section
              title="Catálogo de la tienda"
              subtitle={`${data.webProducts.length} productos · cada producto puede acumular varios lotes`}
              action="＋ Nuevo producto"
              onAction={() => openWebProduct()}
            >
              <div className="inventory-toolbar">
                <label className="inventory-search">
                  <span>Buscar en el catálogo</span>
                  <input type="search" value={webProductSearch} onChange={(event) => setWebProductSearch(event.target.value)} placeholder="Nombre del producto, receta o lote…" />
                </label>
                <span className="inventory-count">{visibleWebProducts.length} de {data.webProducts.length} productos</span>
              </div>
              <div className="web-product-grid">
                {visibleWebProducts.map((product) => {
                  const batches = getWebProductBatches(product);
                  const batch = batches[0];
                  const available = batches.reduce((sum, item) => sum + availableWebBatchStock(item), 0);
                  const batchCodes = batches.map((item) => item.code).join(', ');
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
                        <div className="web-product-card-prices">
                          <strong>{product.promotion_price == null ? 'Sin precio promocional' : money(product.promotion_price)}</strong>
                          {product.normal_price != null && <small className="web-product-normal-price">Normal: {money(product.normal_price)}</small>}
                        </div>
                      </div>
                      <p>{batches.length ? `${batch.recipe_name} · Lotes: ${batchCodes}` : 'Sin lote asignado'}</p>
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
                {visibleWebProducts.length === 0 && <Empty text={data.webProducts.length === 0 ? 'Agrega tu primer producto para organizar el catálogo de la tienda.' : 'No hay productos que coincidan con la búsqueda.'} />}
              </div>
              <div className="web-store-link"><a className="button secondary small" href="./storefront.html" target="_blank" rel="noreferrer">Abrir tienda pública ↗</a></div>
            </Section>
          </div>
        )}
        {tab === 'webSettings' && (
          <Section
            title="Configuración web"
            subtitle="Identidad y datos de contacto que aparecen en la tienda pública"
            className={`mobile-form-section${mobileFormOpen === 'webSettings' ? ' mobile-form-open' : ''}`}
            action={mobileFormOpen === 'webSettings' ? 'Cerrar formulario' : undefined}
            onAction={() => setMobileFormOpen(null)}
          >
            <button type="button" className="mobile-form-launcher" onClick={() => openMobileForm('webSettings')}>⚙ Editar configuración</button>
            <form className="web-editor stack-form" onSubmit={saveWebSettings}>
              <div className="form-grid">
                <Field label="Nombre del negocio"><input required maxLength="120" value={webSettingsDraft?.business_name || ''} onChange={(event) => setWebSettingsDraft({ ...webSettingsDraft, business_name: event.target.value })} /></Field>
                <Field label="Frase de marca"><input maxLength="180" value={webSettingsDraft?.tagline || ''} onChange={(event) => setWebSettingsDraft({ ...webSettingsDraft, tagline: event.target.value })} /></Field>
              </div>
              <Field label="Logo (JPG, PNG o WebP; máximo 8 MB)"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setWebLogoFile(event.target.files?.[0] || null)} /></Field>
              <div className="logo-preview-card">
                {webLogoFile
                  ? <img src={webLogoPreview} alt="Vista previa del logo seleccionado" />
                  : webSettingsDraft?.logo_path
                    ? <img src={supabase.storage.from('jabon').getPublicUrl(webSettingsDraft.logo_path).data.publicUrl} alt="Logo actual del negocio" />
                    : <span aria-hidden="true">✦</span>}
                <div><strong>{webLogoFile ? 'Nuevo logo' : webSettingsDraft?.logo_path ? 'Logo actual' : 'Identidad de tu tienda'}</strong>
                  <small>{webLogoFile ? webLogoFile.name : webSettingsDraft?.logo_path ? 'Vista previa del logo publicado' : 'Elige una imagen para mostrar tu marca.'}</small></div>
              </div>
              <div className="form-grid">
                <Field label="Teléfono de contacto"><input type="tel" maxLength="40" value={webSettingsDraft?.phone || ''} onChange={(event) => setWebSettingsDraft({ ...webSettingsDraft, phone: event.target.value })} /></Field>
                <Field label="Número de WhatsApp para atención y revendedores (con código de país)"><input type="tel" maxLength="40" value={webSettingsDraft?.whatsapp_phone || ''} onChange={(event) => setWebSettingsDraft({ ...webSettingsDraft, whatsapp_phone: event.target.value })} placeholder="50499999999" /></Field>
              </div>
              <div className="form-grid">
                <Field label="Correo electrónico"><input type="email" maxLength="254" value={webSettingsDraft?.email || ''} onChange={(event) => setWebSettingsDraft({ ...webSettingsDraft, email: event.target.value })} /></Field>
                <Field label="Dirección / zona de entrega"><input maxLength="300" value={webSettingsDraft?.address || ''} onChange={(event) => setWebSettingsDraft({ ...webSettingsDraft, address: event.target.value })} /></Field>
              </div>
              <div className="form-grid">
                <Field label="TikTok"><input type="url" maxLength="500" value={webSettingsDraft?.tiktok_url || ''} onChange={(event) => setWebSettingsDraft({ ...webSettingsDraft, tiktok_url: event.target.value })} placeholder="https://www.tiktok.com/@tu_cuenta" /></Field>
                <Field label="Facebook"><input type="url" maxLength="500" value={webSettingsDraft?.facebook_url || ''} onChange={(event) => setWebSettingsDraft({ ...webSettingsDraft, facebook_url: event.target.value })} placeholder="https://www.facebook.com/tu_pagina" /></Field>
                <Field label="Instagram"><input type="url" maxLength="500" value={webSettingsDraft?.instagram_url || ''} onChange={(event) => setWebSettingsDraft({ ...webSettingsDraft, instagram_url: event.target.value })} placeholder="https://www.instagram.com/tu_cuenta" /></Field>
              </div>
              <Field label="Presentación del negocio"><textarea rows="5" maxLength="2000" value={webSettingsDraft?.about_text || ''} onChange={(event) => setWebSettingsDraft({ ...webSettingsDraft, about_text: event.target.value })} placeholder="Cuenta brevemente la historia de tu taller y cómo elaboras tus jabones." /></Field>
              <p className="form-note">El botón de asistencia personalizada y el enlace para revendedores usan este número de WhatsApp. Incluye el código de país sin signos, espacios ni guiones.</p>
              <button className="button primary">Guardar configuración</button>
            </form>
          </Section>
        )}
        {tab === 'loans' && (
          <div className="sales-page">
            <Section
              title="Dinero prestado"
              subtitle="Registra dinero que tomas del negocio y devuelve el saldo mediante abonos"
              action="＋ Registrar dinero prestado"
              onAction={() => setModal({
                kind: 'businessLoan',
                values: { description: '', principal: '', loanDate: today },
              })}
            >
              <div className="stock-total">
                <span>Saldo total por devolver</span>
                <strong>{money(loanRows.reduce((sum, loan) => sum + loan.outstanding, 0))}</strong>
              </div>
              <Table headers={['Fecha', 'Concepto', 'Prestado', 'Devuelto', 'Saldo pendiente', 'Acciones']}>
                {loanRows.map((loan) => (
                  <tr key={loan.id}>
                    <td>{new Date(`${loan.loan_date}T12:00:00`).toLocaleDateString('es-HN')}</td>
                    <td className="strong">{loan.description}</td>
                    <td>{money(loan.principal)}</td>
                    <td>{money(loan.repaid)}</td>
                    <td className={loan.outstanding > 0 ? 'green' : ''}>{money(loan.outstanding)}</td>
                    <td className="sale-actions">
                      {loan.outstanding > 0 && <button className="button primary small" onClick={() => setModal({
                        kind: 'loanRepayment',
                        loan,
                        values: { amount: String(loan.outstanding), paymentDate: today },
                      })}>Registrar abono</button>}
                      {loan.repaid === 0 && <button className="icon-button danger-text" aria-label={`Eliminar préstamo ${loan.description}`} title="Eliminar préstamo" onClick={() => deleteBusinessLoan(loan)}>×</button>}
                    </td>
                  </tr>
                ))}
                {loanRows.length === 0 && <tr><td colSpan="6"><Empty text="Todavía no hay dinero prestado registrado." /></td></tr>}
              </Table>
            </Section>
            <Section title="Historial de devoluciones" subtitle={`${data.loanRepayments.length} abonos registrados`}>
              <Table headers={['Fecha', 'Préstamo', 'Importe devuelto']}>
                {data.loanRepayments.map((repayment) => {
                  const loan = data.businessLoans.find((item) => item.id === repayment.business_loan_id);
                  return (
                    <tr key={repayment.id}>
                      <td>{new Date(`${repayment.payment_date}T12:00:00`).toLocaleDateString('es-HN')}</td>
                      <td className="strong">{loan?.description || 'Préstamo eliminado'}</td>
                      <td className="green">{money(repayment.amount)}</td>
                    </tr>
                  );
                })}
                {data.loanRepayments.length === 0 && <tr><td colSpan="3"><Empty text="Los abonos aparecerán aquí." /></td></tr>}
              </Table>
            </Section>
          </div>
        )}
        {tab === 'finance' && (
          <div className="finance-layout">
            <div className="report-period">
              <label>Desde<input type="date" value={reportPeriod.from} onChange={(event) => setReportPeriod({ ...reportPeriod, from: event.target.value })} /></label>
              <label>Hasta<input type="date" value={reportPeriod.to} onChange={(event) => setReportPeriod({ ...reportPeriod, to: event.target.value })} /></label>
            </div>
            <Section title="Estado de resultados" subtitle="Ventas emitidas, costos, gastos y movimientos de préstamos del período seleccionado">
              <div className="statement-lines">
                <div><span>Ingresos por ventas</span><strong>{money(reports.revenue)}</strong></div>
                <div><span>Ingresos adicionales</span><strong>{money(reports.additionalIncome)}</strong></div>
                <div><span>Costo de productos vendidos</span><strong>− {money(reports.cost)}</strong></div>
                <div className="statement-subtotal"><span>Utilidad bruta</span><strong>{money(reports.grossProfit)}</strong></div>
                <div><span>Gastos operativos</span><strong>− {money(reports.expenses)}</strong></div>
                <div><span>Cuentas incobrables</span><strong>− {money(reports.badDebt)}</strong></div>
                <div className="statement-total"><span>Utilidad neta</span><strong>{money(reports.netIncome)}</strong></div>
                <div><span>Préstamos entregados · movimiento de caja</span><strong>− {money(reports.loanDisbursements)}</strong></div>
                <div><span>Abonos recibidos · movimiento de caja</span><strong>{money(reports.loanRepayments)}</strong></div>
              </div>
              <p className="form-note finance-note">Los préstamos al dueño son cuentas por cobrar; ni el dinero prestado ni sus abonos se consideran ingreso o gasto y no cambian la utilidad neta.</p>
            </Section>
            <Section
              title="Ventas facturadas del período"
              subtitle={`Facturas emitidas entre ${reportPeriod.from} y ${reportPeriod.to}`}
            >
              <div className="metrics-grid finance-sales-summary">
                <Metric label="Total facturado" value={money(reports.revenue)} detail={`${reports.periodSales.length} facturas`} icon="▧" />
                <Metric label="Facturado · pagado" value={money(reports.paidSales)} detail={`${reports.paidSalesCount} facturas`} icon="✓" />
                <Metric label="Facturado · pendiente" value={money(reports.pendingSales)} detail={`${reports.pendingSalesCount} facturas`} icon="◷" warning={reports.pendingSalesCount > 0} />
                <Metric label="Facturado · incobrable" value={money(reports.lostSales)} detail={`${reports.lostSalesCount} facturas`} icon="!" warning={reports.lostSalesCount > 0} />
              </div>
              <Table headers={['Fecha', 'Factura', 'Cliente', 'Importe', 'Estado de pago']}>
                {reports.periodSales.map((sale) => (
                  <tr key={sale.id}>
                    <td>{new Date(`${sale.invoice_date}T12:00:00`).toLocaleDateString('es-HN')}</td>
                    <td><code>{sale.invoice_number}</code></td>
                    <td className="strong">{sale.customer_name}</td>
                    <td className="green">{money(sale.total)}</td>
                    <td><span className={`pill ${sale.payment_status === 'paid' ? 'good' : sale.payment_status === 'lost' ? 'danger' : 'warning'}`}>
                      {paymentStatusLabels[sale.payment_status] || sale.payment_status}
                    </span></td>
                  </tr>
                ))}
              </Table>
            </Section>
            <Section
              title="Registrar ingreso adicional"
              subtitle="Registra conceptos ajenos a ventas; se incluyen en resultados y en el balance"
              className={`mobile-form-section${mobileFormOpen === 'additionalIncome' ? ' mobile-form-open' : ''}`}
              action={mobileFormOpen === 'additionalIncome' ? 'Cerrar formulario' : undefined}
              onAction={() => setMobileFormOpen(null)}
            >
              <button type="button" className="mobile-form-launcher" onClick={() => openMobileForm('additionalIncome')}>＋ Registrar ingreso adicional</button>
              <form className="income-form" onSubmit={saveAdditionalIncome}>
                <label>Concepto<input required maxLength="240" value={additionalIncomeForm.concept} onChange={(event) => setAdditionalIncomeForm({ ...additionalIncomeForm, concept: event.target.value })} placeholder="Ej. Interés recibido" /></label>
                <label>Importe (LPS)<input type="number" min="0.01" step="0.01" required value={additionalIncomeForm.amount} onChange={(event) => setAdditionalIncomeForm({ ...additionalIncomeForm, amount: event.target.value })} /></label>
                <label>Fecha<input type="date" required value={additionalIncomeForm.incomeDate} onChange={(event) => setAdditionalIncomeForm({ ...additionalIncomeForm, incomeDate: event.target.value })} /></label>
                <label>Estado<select value={additionalIncomeForm.paymentStatus} onChange={(event) => setAdditionalIncomeForm({ ...additionalIncomeForm, paymentStatus: event.target.value })}><option value="paid">Cobrado</option><option value="pending">Pendiente de cobro</option></select></label>
                <label>Método<select value={additionalIncomeForm.paymentMethod} onChange={(event) => setAdditionalIncomeForm({ ...additionalIncomeForm, paymentMethod: event.target.value })}>{paymentMethods.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <button className="button primary">Guardar ingreso</button>
              </form>
            </Section>
            <Section title="Ingresos adicionales registrados" subtitle={`${data.additionalIncomes.length} ingresos`}>
              <Table headers={['Fecha', 'Concepto', 'Importe', 'Estado', 'Acciones']}>
                {data.additionalIncomes.map((income) => (
                  <tr key={income.id}>
                    <td>{new Date(`${income.income_date}T12:00:00`).toLocaleDateString('es-HN')}</td>
                    <td className="strong">{income.concept}</td>
                    <td className="green">{money(income.amount)}</td>
                    <td><span className={`pill ${income.payment_status === 'paid' ? 'good' : 'warning'}`}>{income.payment_status === 'paid' ? 'Cobrado' : 'Pendiente'}</span></td>
                    <td className="sale-actions">{income.payment_status === 'pending' && <button className="button primary small" onClick={() => markAdditionalIncomePaid(income)}>Marcar cobrado</button>}</td>
                  </tr>
                ))}
              </Table>
            </Section>
            <Section title="Balance general de gestión" subtitle={`Saldos actuales · base de apertura: ${data.financeSettings?.opening_date || today}`}>
              {!data.financeSettings && <Notice type="error">No se encontraron saldos iniciales. Vuelve a cargar el esquema de Supabase.</Notice>}
              <div className="balance-grid">
                <div>
                  <h3>Activos</h3>
                  <div className="statement-lines compact">
                    <div><span>Efectivo y bancos</span><strong>{money(reports.cash)}</strong></div>
                    <div><span>Cuentas por cobrar comerciales</span><strong>{money(reports.commercialReceivables)}</strong></div>
                    <div><span>Préstamos al dueño por cobrar</span><strong>{money(reports.loanReceivables)}</strong></div>
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
            <Section
              title="Saldos iniciales"
              subtitle="Configura caja, cuentas por cobrar comerciales/pagar y capital a la fecha de inicio"
              className={`mobile-form-section${mobileFormOpen === 'openingBalances' ? ' mobile-form-open' : ''}`}
              action={mobileFormOpen === 'openingBalances' ? 'Cerrar formulario' : undefined}
              onAction={() => setMobileFormOpen(null)}
            >
              <button type="button" className="mobile-form-launcher" onClick={() => openMobileForm('openingBalances')}>＋ Configurar saldos iniciales</button>
              <form className="opening-form" onSubmit={saveOpeningBalances}>
                <label>Fecha de apertura<input type="date" required value={openingForm.opening_date} onChange={(event) => setOpeningForm({ ...openingForm, opening_date: event.target.value })} /></label>
                <label>Efectivo y bancos (LPS)<input type="number" min="0" step="0.01" required value={openingForm.opening_cash} onChange={(event) => setOpeningForm({ ...openingForm, opening_cash: event.target.value })} /></label>
                <label>Cuentas por cobrar comerciales (LPS)<input type="number" min="0" step="0.01" required value={openingForm.opening_receivables} onChange={(event) => setOpeningForm({ ...openingForm, opening_receivables: event.target.value })} /></label>
                <label>Cuentas por pagar (LPS)<input type="number" min="0" step="0.01" required value={openingForm.opening_payables} onChange={(event) => setOpeningForm({ ...openingForm, opening_payables: event.target.value })} /></label>
                <label>Capital / patrimonio inicial (LPS)<input type="number" step="0.01" required value={openingForm.opening_equity} onChange={(event) => setOpeningForm({ ...openingForm, opening_equity: event.target.value })} /></label>
                <button className="button primary">Guardar saldos</button>
                <p className="form-note">Incluye aquí las cuentas por cobrar comerciales, no los préstamos registrados en Prestado. Registra el efectivo, las cuentas por pagar y el valor de las existencias a la fecha de apertura.</p>
              </form>
            </Section>
          </div>
        )}
        <footer className="footer">Fragancia & Miel <span>·</span> Control de costos e inventario</footer>
      </main>
      </div>

      {mobileNavOpen && (
        <div className="mobile-menu-layer">
          <button type="button" className="mobile-menu-scrim" aria-label="Cerrar menú" onClick={() => setMobileNavOpen(false)} />
          <nav id="mobile-navigation-menu" className="mobile-menu-sheet" role="dialog" aria-modal="true" aria-label="Menú principal">
            <div className="mobile-menu-heading">
              <div><p className="eyebrow">FRAGANCIA & MIEL</p><h2>Menú</h2></div>
              <button type="button" className="icon-button" aria-label="Cerrar menú" onClick={() => setMobileNavOpen(false)}>×</button>
            </div>
            <div className="mobile-menu-groups">
              {navigationGroups.map((group) => (
                <section className="mobile-menu-group" key={group.label}>
                  <h3>{group.label}</h3>
                  <div className="mobile-menu-grid">
                    {group.items.map(([id, title, icon]) => (
                      <button
                        type="button"
                        key={id}
                        className={`mobile-menu-item${tab === id ? ' active' : ''}`}
                        aria-current={tab === id ? 'page' : undefined}
                        onClick={() => { setTab(id); setMobileNavOpen(false); }}
                      >
                        <span className="mobile-menu-icon">{icon}</span>
                        <span>{title}</span>
                        {id === 'webOrders' && activeWebOrderCount > 0 && <span className="nav-badge">{activeWebOrderCount > 99 ? '99+' : activeWebOrderCount}</span>}
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
            <div className="mobile-menu-tools">
              <button
                type="button"
                className="button secondary theme-toggle"
                aria-pressed={theme === 'dark'}
                onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              >{theme === 'light' ? '☾ Activar tema oscuro' : '☀ Activar tema claro'}</button>
              <button type="button" className="button ghost" onClick={lockApp}>Salir</button>
            </div>
          </nav>
        </div>
      )}
      <nav className="mobile-bottom-bar" aria-label="Navegación rápida">
        {mobileQuickNavigation.map(([id, label, icon]) => (
          <button type="button" key={id} className={`mobile-bottom-item${tab === id ? ' active' : ''}`} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}>
            <span>{icon}</span><small>{label}</small>
          </button>
        ))}
        <button type="button" className={`mobile-bottom-item${mobileNavOpen || !mobileQuickNavigation.some(([id]) => id === tab) ? ' active' : ''}`} aria-haspopup="dialog" aria-expanded={mobileNavOpen} aria-controls="mobile-navigation-menu" onClick={() => setMobileNavOpen(!mobileNavOpen)}>
          <span>☰</span><small>Menú</small>
        </button>
      </nav>

      {modal?.kind === 'inventoryTake' && (
        <Dialog
          className="inventory-take-dialog"
          title={modal.history ? 'Detalle de toma de inventario' : 'Nueva toma de inventario'}
          onClose={() => setModal(null)}
          closeOnBackdrop={false}
        >
          {modal.history ? (
            <>
              <div className="inventory-take-summary">
                <span>Registrada el {new Date(modal.history.created_at).toLocaleString('es-HN', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                <span className={`pill ${inventoryTakeApplied || !inventoryTakeDraft.some((item) => number(item.countedQuantity) !== item.systemQuantity) ? 'good' : 'warning'}`}>
                  {inventoryTakeApplied
                    ? 'Ajuste aplicado'
                    : inventoryTakeDraft.some((item) => number(item.countedQuantity) !== item.systemQuantity)
                      ? 'Conteo guardado · pendiente de ajuste'
                      : 'Sin diferencias'}
                </span>
                {modal.history.notes && <p>{modal.history.notes}</p>}
              </div>
              <div className="inventory-take-tabs" role="tablist" aria-label="Categorías de la toma">
                {inventoryTakeCategories.map(([category, label, icon]) => (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={inventoryTakeCategory === category}
                    className={`inventory-take-tab${inventoryTakeCategory === category ? ' active' : ''}`}
                    key={category}
                    onClick={() => setInventoryTakeCategory(category)}
                  ><span aria-hidden="true">{icon}</span>{label}</button>
                ))}
              </div>
              <div className="inventory-take-lines">
                {(modal.history.inventory_take_items || [])
                  .filter((item) => item.category === inventoryTakeCategory)
                  .map((item) => (
                    <div className="inventory-take-line" key={item.id}>
                      <div className="inventory-take-item">
                        <strong>{item.item_name}</strong>
                        <small>{item.item_code || 'Sin código'} · {item.category === 'materials' ? 'Materia prima' : item.category === 'utensils' ? 'Utensilios' : 'Jabones'}</small>
                      </div>
                      <div className="inventory-take-values">
                        <span><small>Sistema</small><strong>{number(item.system_quantity)}</strong></span>
                        <span><small>Contado</small><strong>{number(item.counted_quantity)}</strong></span>
                        <span><small>Ajuste</small><strong className={number(item.adjustment) < 0 ? 'negative' : 'positive'}>{number(item.adjustment) > 0 ? '+' : ''}{number(item.adjustment)}</strong></span>
                      </div>
                    </div>
                  ))}
                {!modal.history.inventory_take_items?.some((item) => item.category === inventoryTakeCategory) && (
                  <Empty text="No hay artículos de esta categoría en la toma." />
                )}
              </div>
              {inventoryTakeDraft.some((item) => number(item.countedQuantity) !== item.systemQuantity)
                && !inventoryTakeApplied && (
                  inventoryTakeConfirmingAdjustment ? (
                    <form className="inventory-take-adjust-form" onSubmit={applyInventoryTake}>
                      <label className="inventory-take-notes">
                        <span>Clave de inicio de sesión</span>
                        <input
                          type="password"
                          inputMode="numeric"
                          autoComplete="current-password"
                          required
                          autoFocus
                          value={inventoryTakeCode}
                          onChange={(event) => setInventoryTakeCode(event.target.value)}
                          placeholder="Ingresa tu clave de acceso"
                        />
                      </label>
                      <div className="inventory-take-actions">
                        <button type="button" className="button secondary" onClick={() => { setInventoryTakeConfirmingAdjustment(false); setInventoryTakeCode(''); }}>Volver</button>
                        <button type="submit" className="button primary" disabled={inventoryTakeAdjusting}>
                          {inventoryTakeAdjusting ? 'Aplicando…' : 'Confirmar ajuste'}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="inventory-take-actions">
                      <span>Diferencias pendientes de aplicar.</span>
                      <button type="button" className="button primary" onClick={() => setInventoryTakeConfirmingAdjustment(true)}>Ajustar inventario</button>
                    </div>
                  )
                )}
              {inventoryTakeApplied && <div className="inventory-take-success" role="status">El ajuste ya fue aplicado.</div>}
            </>
          ) : (
            <form className="inventory-take-form" onSubmit={inventoryTakeSaved ? applyInventoryTake : saveInventoryTake}>
              {inventoryTakeSaved && (
                <div className="inventory-take-success" role="status">
                  {inventoryTakeApplied
                    ? 'El conteo quedó guardado y el ajuste ya fue aplicado.'
                    : 'El conteo quedó guardado. Revisa las diferencias; todavía no se ha modificado el inventario.'}
                </div>
              )}
              <div className="inventory-take-step">
                <span className="inventory-take-step-number">1</span>
                <div><strong>Revisa cada categoría</strong><small>Ingresa la cantidad física contada para cada artículo.</small></div>
              </div>
              <div className="inventory-take-tabs" role="tablist" aria-label="Categorías de inventario">
                {inventoryTakeCategories.map(([category, label, icon]) => {
                  const total = inventoryTakeDraft.filter((item) => item.category === category).length;
                  return (
                    <button
                      type="button"
                      role="tab"
                      aria-selected={inventoryTakeCategory === category}
                      className={`inventory-take-tab${inventoryTakeCategory === category ? ' active' : ''}`}
                      key={category}
                      onClick={() => setInventoryTakeCategory(category)}
                    ><span aria-hidden="true">{icon}</span>{label}<small>{total}</small></button>
                  );
                })}
              </div>
              <div className="inventory-take-lines">
                {inventoryTakeDraft.filter((item) => item.category === inventoryTakeCategory).map((item) => (
                  <div className="inventory-take-line" key={`${item.category}-${item.itemId}`}>
                    <div className="inventory-take-item">
                      <strong>{item.name}</strong>
                      <small>{item.code || 'Sin código'} · Sistema: {item.systemQuantity} {item.unit}</small>
                    </div>
                    {inventoryTakeSaved ? (
                      <div className="inventory-take-values">
                        <span><small>Sistema</small><strong>{item.systemQuantity}</strong></span>
                        <span><small>Contado</small><strong>{number(item.countedQuantity)}</strong></span>
                        <span><small>Diferencia</small><strong className={number(item.countedQuantity) - item.systemQuantity < 0 ? 'negative' : 'positive'}>
                          {number(item.countedQuantity) - item.systemQuantity > 0 ? '+' : ''}{number(item.countedQuantity) - item.systemQuantity}
                        </strong></span>
                      </div>
                    ) : (
                      <label className="inventory-take-count">
                        <span>Cantidad física ({item.unit})</span>
                        <input
                          type="number"
                          min="0"
                          step={item.category === 'materials' ? '0.001' : '1'}
                          required
                          value={item.countedQuantity}
                          onChange={(event) => setInventoryTakeDraft((draft) => draft.map((row) => row.itemId === item.itemId && row.category === item.category
                            ? { ...row, countedQuantity: event.target.value }
                            : row))}
                        />
                      </label>
                    )}
                  </div>
                ))}
                {!inventoryTakeDraft.some((item) => item.category === inventoryTakeCategory) && (
                  <Empty text="No hay artículos registrados en esta categoría." />
                )}
              </div>
              {!inventoryTakeSaved && (
                <>
                  <div className="inventory-take-step">
                    <span className="inventory-take-step-number">2</span>
                    <div><strong>Confirma y registra el conteo</strong><small>Guardar el conteo no modifica las existencias; podrás decidir después si aplicas el ajuste.</small></div>
                  </div>
                  <label className="inventory-take-notes">
                    <span>Notas de la toma <small>(opcional)</small></span>
                    <textarea maxLength="500" rows="2" value={modal.notes} onChange={(event) => setModal({ ...modal, notes: event.target.value })} placeholder="Ej. Conteo semanal del almacén" />
                  </label>
                  <div className="inventory-take-actions">
                    <span>El registro se guardará en el historial.</span>
                    <button type="submit" className="button primary" disabled={inventoryTakeSaving || !inventoryTakeDraft.length}>
                      {inventoryTakeSaving ? 'Guardando…' : 'Guardar conteo'}
                    </button>
                  </div>
                </>
              )}
              {inventoryTakeSaved && (
                <>
                  {inventoryTakeDraft.some((item) => number(item.countedQuantity) !== item.systemQuantity) ? (
                    inventoryTakeApplied ? (
                      <div className="inventory-take-success" role="status">El ajuste ya fue aplicado.</div>
                    ) : inventoryTakeConfirmingAdjustment ? (
                      <>
                        <label className="inventory-take-notes">
                          <span>Clave de inicio de sesión</span>
                          <input
                            type="password"
                            inputMode="numeric"
                            autoComplete="current-password"
                            required
                            autoFocus
                            value={inventoryTakeCode}
                            onChange={(event) => setInventoryTakeCode(event.target.value)}
                            placeholder="Ingresa tu clave de acceso"
                          />
                        </label>
                        <div className="inventory-take-actions">
                          <button type="button" className="button secondary" onClick={() => { setInventoryTakeConfirmingAdjustment(false); setInventoryTakeCode(''); }}>Volver</button>
                          <button type="submit" className="button primary" disabled={inventoryTakeAdjusting}>
                            {inventoryTakeAdjusting ? 'Aplicando…' : 'Confirmar ajuste'}
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="inventory-take-actions">
                        <span>Las diferencias aún no afectan las existencias.</span>
                        <button type="button" className="button primary" onClick={() => setInventoryTakeConfirmingAdjustment(true)}>Ajustar inventario</button>
                      </div>
                    )
                  ) : (
                    <div className="inventory-take-success" role="status">No hay diferencias que ajustar.</div>
                  )}
                </>
              )}
            </form>
          )}
        </Dialog>
      )}
      {modal && !['production', 'sale', 'purchase', 'purchaseDetail', 'invoice', 'deleteSale', 'completeWebOrder', 'webOrderDetail', 'webProduct', 'customOrder', 'expense', 'collectionReminder', 'manualReservation', 'businessLoan', 'loanRepayment', 'promotionEvent', 'inventoryTake'].includes(modal.kind) && (
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
      {modal?.kind === 'expense' && (
        <Dialog title={modal.expenseId ? 'Editar gasto' : 'Registrar gasto'} onClose={() => setModal(null)}>
          <form className="stack-form" onSubmit={saveExpense}>
            <Field label="Descripción"><input required maxLength="200" value={modal.values.description} onChange={(event) => setModal({ ...modal, values: { ...modal.values, description: event.target.value } })} placeholder="Ej. Transporte" /></Field>
            <Field label="Categoría"><input required maxLength="100" value={modal.values.category} onChange={(event) => setModal({ ...modal, values: { ...modal.values, category: event.target.value } })} placeholder="Ej. Operación" /></Field>
            <div className="form-grid">
              <Field label="Importe (LPS)"><input type="number" min="0.01" step="0.01" required value={modal.values.amount} onChange={(event) => setModal({ ...modal, values: { ...modal.values, amount: event.target.value } })} /></Field>
              <Field label="Fecha"><input type="date" required value={modal.values.expenseDate} onChange={(event) => setModal({ ...modal, values: { ...modal.values, expenseDate: event.target.value } })} /></Field>
              <Field label="Estado de pago"><select value={modal.values.paymentStatus} onChange={(event) => setModal({ ...modal, values: { ...modal.values, paymentStatus: event.target.value } })}><option value="paid">Pagado</option><option value="pending">Pendiente</option></select></Field>
              <Field label="Método de pago"><select value={modal.values.paymentMethod} onChange={(event) => setModal({ ...modal, values: { ...modal.values, paymentMethod: event.target.value } })}>{paymentMethods.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
            </div>
            <div className="dialog-actions"><button type="button" className="button secondary" onClick={() => setModal(null)}>Cancelar</button><button className="button primary">Guardar gasto</button></div>
          </form>
        </Dialog>
      )}
      {modal?.kind === 'collectionReminder' && (
        <Dialog title="Registrar cobro pendiente" onClose={() => setModal(null)}>
          <form className="stack-form" onSubmit={saveCollectionReminder}>
            <Field label="Cliente"><input required maxLength="160" value={collectionReminderForm.customerName} onChange={(event) => setCollectionReminderForm({ ...collectionReminderForm, customerName: event.target.value })} /></Field>
            <Field label="Teléfono (opcional)"><input type="tel" maxLength="40" value={collectionReminderForm.customerPhone} onChange={(event) => setCollectionReminderForm({ ...collectionReminderForm, customerPhone: event.target.value })} /></Field>
            <Field label="Concepto"><input required maxLength="240" value={collectionReminderForm.concept} onChange={(event) => setCollectionReminderForm({ ...collectionReminderForm, concept: event.target.value })} placeholder="Ej. Pago acordado" /></Field>
            <div className="form-grid">
              <Field label="Importe (LPS)"><input type="number" min="0.01" step="0.01" required value={collectionReminderForm.amount} onChange={(event) => setCollectionReminderForm({ ...collectionReminderForm, amount: event.target.value })} /></Field>
              <Field label="Fecha de recordatorio"><input type="date" required value={collectionReminderForm.dueDate} onChange={(event) => setCollectionReminderForm({ ...collectionReminderForm, dueDate: event.target.value })} /></Field>
            </div>
            <div className="dialog-actions"><button type="button" className="button secondary" onClick={() => setModal(null)}>Cancelar</button><button className="button primary">＋ Agregar recordatorio</button></div>
          </form>
        </Dialog>
      )}
      {modal?.kind === 'manualReservation' && (() => {
        const selectedProduct = data.webProducts.find((product) => product.id === modal.values.productId);
        const available = selectedProduct
          ? getWebProductBatches(selectedProduct).reduce((sum, batch) => sum + availableWebBatchStock(batch), 0)
          : 0;
        return (
          <Dialog title="Nueva reservación manual" onClose={() => setModal(null)}>
            <form className="stack-form" onSubmit={saveManualReservation}>
              <Field label="Producto"><select required value={modal.values.productId} onChange={(event) => setModal({ ...modal, values: { ...modal.values, productId: event.target.value } })}>
                <option value="" disabled>Selecciona un producto</option>
                {data.webProducts.filter((product) => product.active && getWebProductBatches(product).length > 0).map((product) => (
                  <option key={product.id} value={product.id}>{product.name}</option>
                ))}
              </select></Field>
              {selectedProduct && <p className="form-note">Disponibles para reservar: {available} unidades.</p>}
              <Field label="Nombre del cliente"><input required maxLength="160" value={modal.values.customerName} onChange={(event) => setModal({ ...modal, values: { ...modal.values, customerName: event.target.value } })} /></Field>
              <div className="form-grid">
                <Field label="Teléfono (opcional)"><input type="tel" maxLength="40" value={modal.values.customerPhone} onChange={(event) => setModal({ ...modal, values: { ...modal.values, customerPhone: event.target.value } })} /></Field>
                <Field label="Cantidad"><input type="number" min="1" max="100" step="1" required value={modal.values.quantity} onChange={(event) => setModal({ ...modal, values: { ...modal.values, quantity: event.target.value } })} /></Field>
                <Field label="Fecha"><input type="date" required value={modal.values.reservationDate} onChange={(event) => setModal({ ...modal, values: { ...modal.values, reservationDate: event.target.value } })} /></Field>
              </div>
              <p className="form-note">El sistema asigna las unidades a los lotes disponibles y aparta el inventario hasta que canceles la reservación.</p>
              <div className="dialog-actions"><button type="button" className="button secondary" onClick={() => setModal(null)}>Cancelar</button><button className="button primary">Guardar y reservar stock</button></div>
            </form>
          </Dialog>
        );
      })()}
      {modal?.kind === 'businessLoan' && (
        <Dialog title="Registrar dinero prestado" onClose={() => setModal(null)}>
          <form className="stack-form" onSubmit={saveBusinessLoan}>
            <Field label="Concepto / motivo"><input required maxLength="200" value={modal.values.description} onChange={(event) => setModal({ ...modal, values: { ...modal.values, description: event.target.value } })} placeholder="Ej. Dinero tomado para uso personal" /></Field>
            <div className="form-grid">
              <Field label="Importe (LPS)"><input type="number" min="0.01" step="0.01" required value={modal.values.principal} onChange={(event) => setModal({ ...modal, values: { ...modal.values, principal: event.target.value } })} /></Field>
              <Field label="Fecha"><input type="date" required value={modal.values.loanDate} onChange={(event) => setModal({ ...modal, values: { ...modal.values, loanDate: event.target.value } })} /></Field>
            </div>
            <p className="form-note">Se reducirá el efectivo y el saldo quedará en cuentas por cobrar; no se registrará como gasto.</p>
            <div className="dialog-actions"><button type="button" className="button secondary" onClick={() => setModal(null)}>Cancelar</button><button className="button primary">Registrar préstamo</button></div>
          </form>
        </Dialog>
      )}
      {modal?.kind === 'loanRepayment' && (
        <Dialog title={`Registrar abono · ${modal.loan.description}`} onClose={() => setModal(null)}>
          <form className="stack-form" onSubmit={saveLoanRepayment}>
            <p className="sale-total"><span>Saldo por devolver</span><strong>{money(modal.loan.outstanding)}</strong></p>
            <div className="form-grid">
              <Field label="Importe devuelto (LPS)"><input type="number" min="0.01" max={modal.loan.outstanding} step="0.01" required value={modal.values.amount} onChange={(event) => setModal({ ...modal, values: { ...modal.values, amount: event.target.value } })} /></Field>
              <Field label="Fecha"><input type="date" required value={modal.values.paymentDate} onChange={(event) => setModal({ ...modal, values: { ...modal.values, paymentDate: event.target.value } })} /></Field>
            </div>
            <p className="form-note">El abono aumentará el efectivo y reducirá la cuenta por cobrar; no se registrará como ingreso.</p>
            <div className="dialog-actions"><button type="button" className="button secondary" onClick={() => setModal(null)}>Cancelar</button><button className="button primary">Guardar abono</button></div>
          </form>
        </Dialog>
      )}
      {modal?.kind === 'webProduct' && webProductDraft && (
        <Dialog className="sales-dialog web-product-dialog" title={webProductDraft.id ? 'Editar producto web' : 'Agregar producto a la tienda'} onClose={() => { setModal(null); setWebProductDraft(null); setWebProductFile(null); }}>
          <form className="stack-form" onSubmit={saveWebProduct}>
            <div className="form-grid">
              <Field label="Nombre del producto"><input required maxLength="120" value={webProductDraft.name} onChange={(event) => setWebProductDraft({ ...webProductDraft, name: event.target.value })} /></Field>
              <div className="form-note">
                <strong>Lotes asignados:</strong>{' '}
                {webProductDraft.id
                  ? getWebProductBatches(data.webProducts.find((product) => product.id === webProductDraft.id) || {})
                    .map((batch) => `${batch.recipe_name} · ${batch.code}`)
                    .join(', ') || 'ninguno'
                  : 'ninguno'}
                {' '}Los nuevos lotes se agregan desde el formulario de producción.
              </div>
            </div>
            <div className="form-grid">
              <Field label="Precio normal (LPS)"><input required type="number" min="0" step="0.01" value={webProductDraft.normalPrice} onChange={(event) => setWebProductDraft({ ...webProductDraft, normalPrice: event.target.value })} /></Field>
              <Field label="Precio promocional (LPS)"><input required type="number" min="0" step="0.01" value={webProductDraft.promotionPrice} onChange={(event) => setWebProductDraft({ ...webProductDraft, promotionPrice: event.target.value })} /></Field>
            </div>
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
      {modal?.kind === 'customOrder' && (
        <Dialog className="custom-order-dialog" title={modal.orderId ? 'Editar pedido personalizado' : 'Crear pedido personalizado'} onClose={() => setModal(null)}>
          <form className="stack-form" onSubmit={saveCustomOrder}>
            <Field label="Nombre del cliente">
              <input required maxLength="120" autoComplete="name" value={modal.values.customerName} onChange={(event) => setModal({ ...modal, values: { ...modal.values, customerName: event.target.value } })} />
            </Field>
            <Field label="Celular">
              <input required type="tel" maxLength="30" autoComplete="tel" value={modal.values.customerPhone} onChange={(event) => setModal({ ...modal, values: { ...modal.values, customerPhone: event.target.value } })} />
            </Field>
            <div className="form-grid">
              <Field label="Diseño">
                <input required maxLength="120" value={modal.values.design} onChange={(event) => setModal({ ...modal, values: { ...modal.values, design: event.target.value } })} />
              </Field>
              <Field label="Fragancia">
                <input required maxLength="120" value={modal.values.fragrance} onChange={(event) => setModal({ ...modal, values: { ...modal.values, fragrance: event.target.value } })} />
              </Field>
            </div>
            <div className="form-grid">
              <Field label="Color">
                <input required maxLength="80" value={modal.values.color} onChange={(event) => setModal({ ...modal, values: { ...modal.values, color: event.target.value } })} />
              </Field>
              <Field label="Cantidad">
                <input required type="number" min="1" step="1" value={modal.values.quantity} onChange={(event) => setModal({ ...modal, values: { ...modal.values, quantity: event.target.value } })} />
              </Field>
              <Field label="Valor total del pedido (LPS)">
                <input required type="number" min="0.01" step="0.01" value={modal.values.orderValue} onChange={(event) => setModal({ ...modal, values: { ...modal.values, orderValue: event.target.value } })} />
              </Field>
            </div>
            <div className="dialog-actions">
              <button type="button" className="button secondary" onClick={() => setModal(null)}>Cancelar</button>
              <button className="button primary">{modal.orderId ? 'Guardar cambios' : 'Guardar pedido'}</button>
            </div>
          </form>
        </Dialog>
      )}
      {modal?.kind === 'promotionEvent' && (
        <Dialog className="promotion-event-dialog" title={modal.eventId ? 'Editar actividad comercial' : 'Planificar actividad comercial'} onClose={() => setModal(null)}>
          <form className="stack-form" onSubmit={savePromotionEvent}>
            <div className="form-grid">
              <Field label="Fecha"><input required type="date" value={modal.values.eventDate} onChange={(event) => setModal({ ...modal, values: { ...modal.values, eventDate: event.target.value } })} /></Field>
              <Field label="Actividad"><input required maxLength="160" value={modal.values.activity} onChange={(event) => setModal({ ...modal, values: { ...modal.values, activity: event.target.value } })} placeholder="Ej. Publicar promoción de temporada" /></Field>
            </div>
            <Field label="Recursos necesarios"><textarea required rows="3" maxLength="1000" value={modal.values.resources} onChange={(event) => setModal({ ...modal, values: { ...modal.values, resources: event.target.value } })} placeholder="Ej. Fotos del producto, presupuesto para anuncios y muestras" /></Field>
            <Field label="Objetivo"><textarea required rows="3" maxLength="1000" value={modal.values.objective} onChange={(event) => setModal({ ...modal, values: { ...modal.values, objective: event.target.value } })} placeholder="Ej. Generar 15 consultas y cerrar 5 ventas" /></Field>
            <div className="dialog-actions">
              <button type="button" className="button secondary" onClick={() => setModal(null)}>Cancelar</button>
              <button className="button primary">{modal.eventId ? 'Guardar cambios' : 'Agregar al calendario'}</button>
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
              <div className="list-heading"><h3>Productos</h3><button type="button" className="text-button" onClick={() => setSaleDraft({ ...saleDraft, items: [...saleDraft.items, { webProductId: '', quantity: '1' }] })}>＋ Agregar producto</button></div>
              {saleProducts.length === 0 && <p className="form-note">No hay productos web vinculados a una receta con precio. Vincula un lote y configura el precio de la receta para poder facturarlos.</p>}
              {saleDraft.items.map((item, index) => {
                const { product, recipe } = saleProducts.find(({ product: entry }) => entry.id === item.webProductId) || {};
                const selectedPrice = product?.promotion_price ?? product?.normal_price;
                return (
                  <div className="sale-item-row" key={`${index}-${item.webProductId}`}>
                    <select aria-label="Producto web" value={item.webProductId} required onChange={(event) => setSaleDraft({
                      ...saleDraft,
                      items: saleDraft.items.map((row, rowIndex) => rowIndex === index ? { ...row, webProductId: event.target.value } : row),
                    })}>
                      <option value="" disabled>Selecciona un producto web</option>
                      {saleProducts.map(({ product: webProduct }) => <option key={webProduct.id} value={webProduct.id}>
                        {webProduct.name} · {money(webProduct.promotion_price ?? webProduct.normal_price)}
                      </option>)}
                    </select>
                    <input aria-label="Cantidad" placeholder="Cant." type="number" min="1" step="1" required value={item.quantity} onChange={(event) => setSaleDraft({
                      ...saleDraft,
                      items: saleDraft.items.map((row, rowIndex) => rowIndex === index ? { ...row, quantity: event.target.value } : row),
                    })} />
                    <span className="sale-line-price">{product
                      ? `Disp. ${availableFinishedStock(recipe.id)} · ${money(selectedPrice)}${product.promotion_price != null && product.normal_price != null ? ` (Normal ${money(product.normal_price)})` : ''}`
                      : '—'}</span>
                    <button type="button" className="icon-button danger-text" aria-label="Quitar producto" onClick={() => setSaleDraft({
                      ...saleDraft,
                      items: saleDraft.items.filter((_, rowIndex) => rowIndex !== index),
                    })}>×</button>
                  </div>
                );
              })}
            </div>
            <div className="sale-total"><span>Total de la venta</span><strong>{money(saleDraftTotal)}</strong></div>
            <p className="form-note">Se usa el precio promocional de la tienda (o el normal si no hay promoción). La venta queda en borrador; al emitirla se verifica y descuenta el stock de la receta vinculada.</p>
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
              <strong className="no-print">COMPROBANTE INTERNO<br />NO FISCAL</strong>
            </header>
            <div className="invoice-meta">
              <p><span>Número</span><strong>{modal.sale.invoice_number}</strong></p>
              <p><span>Fecha</span><strong>{new Date(`${modal.sale.invoice_date}T12:00:00`).toLocaleDateString('es-HN')}</strong></p>
              <p><span>Cliente</span><strong>{modal.sale.customer_name}</strong></p>
              {modal.sale.customer_phone && <p><span>Teléfono</span><strong>{modal.sale.customer_phone}</strong></p>}
              <p><span>Pago</span><strong>{paymentMethods.find(([value]) => value === modal.sale.payment_method)?.[1] || 'Otro'}</strong></p>
              <p><span>Estado</span><strong>{paymentStatusLabels[modal.sale.payment_status] || modal.sale.payment_status}</strong></p>
            </div>
            <table className="invoice-table">
              <thead><tr><th>Producto</th><th>Precio</th><th>Cant.</th><th>Importe</th></tr></thead>
              <tbody>{(modal.sale.sale_items || []).map((item) => (
                <tr key={item.id}>
                  <td data-label="Producto">{item.recipe_name}<small>{priceTypes.find(([value]) => value === item.price_type)?.[1]}</small></td>
                  <td data-label="Precio">{money(item.unit_price)}</td>
                  <td data-label="Cantidad">{item.quantity}</td>
                  <td data-label="Importe">{money(item.line_total)}</td>
                </tr>
              ))}</tbody>
            </table>
            <div className="invoice-total"><span>Total</span><strong>{money(modal.sale.total)}</strong></div>
            <p className="invoice-thanks">¡Gracias por tu compra!</p>
          </div>
          <div className="dialog-actions no-print">
            <button type="button" className="button secondary" onClick={() => setModal(null)}>Cerrar</button>
            <button type="button" className="button secondary" onClick={() => setModal({ kind: 'deleteSale', sale: modal.sale })}>Eliminar factura</button>
            <button type="button" className="button primary" onClick={() => window.print()}>Imprimir / reimprimir</button>
          </div>
        </Dialog>
      )}
      {modal?.kind === 'deleteSale' && (
        <Dialog
          title={modal.sale.status === 'issued' ? 'Confirmar eliminación de factura' : 'Confirmar eliminación de borrador'}
          onClose={() => { if (!deletingSale) setModal(null); }}
        >
          <form className="stack-form" onSubmit={confirmDeleteSale}>
            <p className="form-note">
              Se eliminará {modal.sale.status === 'issued'
                ? `la factura ${modal.sale.invoice_number}`
                : `el borrador VTA-${modal.sale.id.slice(0, 8).toUpperCase()}`}.
              {' '}Esta acción no se puede deshacer{modal.sale.status === 'issued' ? '; las existencias disponibles se recalcularán.' : '.'}
            </p>
            <Field label="Clave de acceso (la misma que usas para ingresar)">
              <input name="accessCode" type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength="4" autoComplete="off" autoFocus required />
            </Field>
            <div className="dialog-actions">
              <button type="button" className="button secondary" disabled={deletingSale} onClick={() => setModal(null)}>Cancelar</button>
              <button className="button primary danger-button" disabled={deletingSale}>
                {deletingSale ? 'Eliminando…' : 'Confirmar eliminación'}
              </button>
            </div>
          </form>
        </Dialog>
      )}
      {modal?.kind === 'completeWebOrder' && (
        <Dialog title={`Registrar entrega del pedido ${modal.order.order_number}`} onClose={() => setModal(null)}>
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
              <button className="button primary">Confirmar entrega</button>
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
              <label>Buscar receta<input type="search" value={productionRecipeSearch} onChange={(event) => setProductionRecipeSearch(event.target.value)} placeholder="Escribe el nombre de la receta…" /></label>
              <label>Receta<select name="recipeId" required value={productionRecipeId} onChange={(event) => { const selected = data.recipes.find((item) => item.id === event.target.value); setProductionRecipeId(event.target.value); const quantity = document.querySelector('[name="quantity"]'); if (selected && quantity) quantity.value = selected.batchSize; }}>
                <option value="" disabled>Selecciona una receta</option>{data.recipes.filter((item) => item.id === productionRecipeId || item.name.toLocaleLowerCase('es').includes(productionRecipeSearch.trim().toLocaleLowerCase('es'))).map((item) => <option key={item.id} value={item.id}>{item.name} · lote de {item.batchSize}</option>)}
              </select></label>
              <label>Producto web que abastecer (opcional)<select name="webProductId" defaultValue="">
                <option value="">No asignar a un producto web</option>
                {productionRecipeId && data.webProducts.filter((product) => getWebProductBatches(product)
                  .every((batch) => batch.recipe_id === productionRecipeId))
                  .map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
              </select></label>
              <label>Código / número de lote<input name="code" defaultValue={makeCode()} required /></label>
              <label>Cantidad de jabones<input name="quantity" type="number" min="1" defaultValue="" required /></label>
              <p className="form-note">Al elegir un producto web, el lote nuevo se agregará junto a los lotes actuales y sumará sus existencias. Los pedidos ya reservados conservarán sus lotes. La producción descuenta las materias primas; si no hay existencias suficientes, no se guardará.</p>
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
  const rows = Children.toArray(children).filter((row) => isValidElement(row) && row.type === 'tr');
  const cards = rows.map((row, rowIndex) => {
    const fields = [];
    const actions = [];
    let columnIndex = 0;
    Children.forEach(row.props.children, (cell) => {
      if (!isValidElement(cell)) return;
      if (cell.type === Actions) {
        actions.push(<ActionButtons key={`actions-${rowIndex}`} {...cell.props} />);
        return;
      }
      if (cell.type !== 'td') return;
      const label = headers[columnIndex++] || '';
      const classNames = String(cell.props.className || '').split(/\s+/);
      if (classNames.includes('actions-cell') || classNames.includes('sale-actions')) {
        actions.push(cell.props.children);
        return;
      }
      fields.push({
        label,
        className: cell.props.className || '',
        content: cell.props.children,
      });
    });
    const [title, ...details] = fields;
    return (
      <article className="mobile-table-card" key={row.key || rowIndex}>
        {title && <div className="mobile-table-card-title"><span>{title.label}</span><div className={title.className}>{title.content}</div></div>}
        <div className="mobile-table-card-fields">
          {details.map((field, index) => (
            <div className={`mobile-table-card-field${['Productos', 'Descripción'].includes(field.label) ? ' wide' : ''}`} key={`${field.label}-${index}`}>
              <span>{field.label}</span>
              <div className={field.className}>{field.content}</div>
            </div>
          ))}
        </div>
        {actions.length > 0 && <div className="mobile-table-card-actions">{actions}</div>}
      </article>
    );
  });
  const empty = rows.length === 0;
  return (
    <>
      <div className="table-wrap">
        <table>
          <thead><tr>{headers.map((header, index) => <th key={`${header}-${index}`}>{header}</th>)}</tr></thead>
          <tbody>{children}{empty && <tr><td colSpan={headers.length}><Empty text="Todavía no hay registros." /></td></tr>}</tbody>
        </table>
      </div>
      <div className="mobile-table-cards">
        {empty ? <div className="mobile-table-empty"><Empty text="Todavía no hay registros." /></div> : cards}
      </div>
    </>
  );
}
function Actions({ onEdit, onDelete }) {
  return <td className="actions-cell"><ActionButtons onEdit={onEdit} onDelete={onDelete} /></td>;
}
function ActionButtons({ onEdit, onDelete }) {
  return <>{onEdit && <button className="icon-button" aria-label="Editar" title="Editar" onClick={onEdit}>✎</button>}{onDelete && <button className="icon-button danger-text" aria-label="Eliminar" title="Eliminar" onClick={onDelete}>×</button>}</>;
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
function Dialog({ title, onClose, children, className = '', closeOnBackdrop = true }) {
  return <div className="dialog-backdrop" onMouseDown={(event) => { if (closeOnBackdrop && event.target === event.currentTarget) onClose(); }}><section className={`dialog ${className}`} role="dialog" aria-modal="true" aria-label={title}><div className="dialog-heading"><h2>{title}</h2><button type="button" className="icon-button" aria-label="Cerrar" onClick={onClose}>×</button></div>{children}</section></div>;
}
function Field({ label, children }) {
  return <label>{label}{children}</label>;
}

export default App;
