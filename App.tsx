import React, { useState, useEffect, useMemo, useCallback, createContext, useContext } from 'react';
import type { Theme, Page, Batch, CalculatedBatch, Settings, MonthlyReport, BatchType } from './types';
import { generateBillPdf, backupDataAsJson, exportReportAsCsv, exportMachineReportAsCsv } from './utils';
import { GoogleGenAI } from "@google/genai";


// Add Recharts to window type for TypeScript
// FIX: Extend the global Window interface instead of redeclaring `window`.
// This ensures that standard window properties like `localStorage` and `confirm` are available.
declare global {
  interface Window {
    Recharts: any;
    jspdf: any;
  }
}

// ==================================
//      MOCK DATA & DEFAULTS
// ==================================
const getTodayDateString = (): string => new Date().toISOString().split('T')[0];

const MOCK_BATCHES: Omit<Batch, 'status'>[] = [
    { id: '1', name: 'Autumn Collection Run 1', batchNumber: 'ACR001', machineNumber: 1, startDate: '2023-10-01', endDate: '2023-10-05', meterValue: 1250.5, color: '#16a34a' },
    { id: '2', name: 'Winter Fabric Prep', batchNumber: 'WFP001', machineNumber: 2, startDate: '2023-10-03', endDate: '2023-10-08', meterValue: 2100.2, color: '#16a34a' },
    { id: '3', name: 'Spring Pattern Test', batchNumber: 'SPT001', machineNumber: 1, startDate: '2023-10-10', endDate: '2023-10-15', meterValue: 950.0, color: '#f59e0b' },
    { id: '4', name: 'Holiday Special Edition', batchNumber: 'HSE001', machineNumber: 3, startDate: '2023-10-12', endDate: '2023-10-20', meterValue: 3500.8, color: '#f59e0b' },
    { id: '5', name: 'Denim Wash Experiment', batchNumber: 'DWE001', machineNumber: 2, startDate: '2023-10-18', endDate: '2023-10-25', meterValue: 2200.7, color: '#dc2626' },
];

const MOCK_BATCH_TYPES: BatchType[] = [
    { id: '1', batchNumber: 'ACR001', color: '#16a34a' },
    { id: '2', batchNumber: 'WFP001', color: '#06b6d4' },
    { id: '3', batchNumber: 'SPT001', color: '#f59e0b' },
    { id: '4', batchNumber: 'HSE001', color: '#ef4444' },
    { id: '5', batchNumber: 'DWE001', color: '#3b82f6' },
    { id: '6', batchNumber: 'SUMMER-LITE', color: '#eab308' },
];

// ==================================
//      CUSTOM HOOKS
// ==================================
function useLocalStorage<T>(key: string, initialValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(error);
      return initialValue;
    }
  });

  const setValue: React.Dispatch<React.SetStateAction<T>> = (value) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (error) {
      console.error(error);
    }
  };

  return [storedValue, setValue];
}

// ==================================
//      REACT CONTEXT
// ==================================
interface AppContextType {
    settings: Settings | null;
    setSettings: React.Dispatch<React.SetStateAction<Settings | null>>;
    batches: Batch[];
    setBatches: React.Dispatch<React.SetStateAction<Batch[]>>;
    addBatch: (newBatch: Omit<Batch, 'id' | 'status' | 'name'>) => void;
    updateBatch: (updatedBatch: Batch) => void;
    deleteBatch: (batchId: string) => void;
    batchTypes: BatchType[];
    addBatchType: (newBatchType: Omit<BatchType, 'id'>) => void;
    updateBatchType: (updatedBatchType: BatchType) => void;
    deleteBatchType: (batchTypeId: string) => void;
    theme: Theme;
    toggleTheme: () => void;
    notification: string | null;
    setNotification: (message: string | null) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const useAppContext = () => {
    const context = useContext(AppContext);
    if (!context) throw new Error("useAppContext must be used within an AppProvider");
    return context;
}

const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [settings, setSettings] = useLocalStorage<Settings | null>('geetha-tex-settings', null);
    const [batches, setBatches] = useLocalStorage<Batch[]>('geetha-tex-batches', []);
    const [batchTypes, setBatchTypes] = useLocalStorage<BatchType[]>('geetha-tex-batch-types', []);
    const [theme, setTheme] = useLocalStorage<Theme>('geetha-tex-theme', 'light');
    const [notification, setNotification] = useState<string | null>(null);

    useEffect(() => {
        if (theme === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, [theme]);
    
    useEffect(() => {
        if(notification) {
            const timer = setTimeout(() => setNotification(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [notification]);

    const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');

    const addBatch = (newBatch: Omit<Batch, 'id' | 'status' | 'name'>) => {
        const batchWithId = { ...newBatch, id: Date.now().toString(), status: 'In Progress' as const, name: '' };
        setBatches(prev => [batchWithId, ...prev]);
        setNotification("New batch added successfully!");
    };

    const updateBatch = (updatedBatch: Batch) => {
        setBatches(prev => prev.map(b => b.id === updatedBatch.id ? updatedBatch : b));
        setNotification(`Batch ${updatedBatch.batchNumber} updated!`);
    };

    const deleteBatch = (batchId: string) => {
        setBatches(prev => prev.filter(b => b.id !== batchId));
        setNotification("Batch deleted successfully!");
    };

    const addBatchType = (newBatchType: Omit<BatchType, 'id'>) => {
        const typeWithId = { ...newBatchType, id: Date.now().toString() };
        setBatchTypes(prev => [...prev, typeWithId]);
        setNotification("Batch type added successfully!");
    };
    
    const updateBatchType = (updatedBatchType: BatchType) => {
        setBatchTypes(prev => prev.map(bt => bt.id === updatedBatchType.id ? updatedBatchType : bt));
        // Avoid notification spam when dragging color picker
        // setNotification(`Batch type ${updatedBatchType.batchNumber} updated!`);
    };
    
    const deleteBatchType = (batchTypeId: string) => {
        setBatchTypes(prev => prev.filter(bt => bt.id !== batchTypeId));
        setNotification("Batch type deleted successfully!");
    };
    
    useEffect(() => {
      if(settings && batches.length === 0) {
        setBatches(MOCK_BATCHES.map(b => ({...b, status: 'In Progress' as const })));
        setBatchTypes(MOCK_BATCH_TYPES);
      }
    }, [settings, batches.length, setBatches, setBatchTypes]);

    return (
        <AppContext.Provider value={{ settings, setSettings, batches, setBatches, addBatch, updateBatch, deleteBatch, batchTypes, addBatchType, updateBatchType, deleteBatchType, theme, toggleTheme, notification, setNotification }}>
            {children}
        </AppContext.Provider>
    );
};


// ==================================
//      ICON COMPONENTS
// ==================================
const SunIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>;
const MoonIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>;
const DashboardIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>;
const MachineIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 15.5 18 20l-1.5 1.5-3.5-4.5-3.5 4.5L8 20l3.5-4.5L8 11l1.5-1.5 3.5 4.5 3.5-4.5L18 11l-3.5 4.5Z"/><path d="m8.9 8.2 1.8-1.8-1.5-1.5-3 3-1.5-1.5 3-3L9 5l1.5 1.5-1.8 1.8"/><path d="M11 22V10"/><path d="M7 10V2h10v8"/></svg>;
const ReportsIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" x2="12" y1="20" y2="10"/><line x1="18" x2="18" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="16"/></svg>;
const UserIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
const SettingsIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 0 2l-.15.08a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1 0 2l.15-.08a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>;
const PlusIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
const ReceiptIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h6"/><path d="M12 18V6"/></svg>;
const ChevronLeftIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>;
const ChevronRightIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>;
const DownloadIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>;
const EditIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>;
const DeleteIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>;
const BrainIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15A2.5 2.5 0 0 1 9.5 22h-3A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2h3z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 2.5 2.5h3A2.5 2.5 0 0 0 20 19.5v-15A2.5 2.5 0 0 0 17.5 2h-3z"/><path d="M9 12h6"/></svg>;
const CalculatorIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="12" y2="16"/></svg>;

// ==================================
//      UI & LAYOUT COMPONENTS
// ==================================
const Notification: React.FC<{ message: string; }> = ({ message }) => (
    <div className="fixed top-5 right-5 bg-brand-teal text-white py-2 px-4 rounded-lg shadow-lg z-50 animate-fade-in-down">
      {message}
    </div>
);

const Header: React.FC<{ onSidebarToggle: () => void }> = ({ onSidebarToggle }) => {
    const { settings, theme, toggleTheme } = useAppContext();
    return (
        <header className="bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm sticky top-0 z-30">
            <div className="flex items-center justify-between h-16 px-4 sm:px-6 lg:px-8 border-b border-slate-200 dark:border-slate-700">
                <div className="flex items-center">
                    <button onClick={onSidebarToggle} className="lg:hidden mr-4 p-2 rounded-full text-slate-500 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-700">
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" x2="21" y1="12" y2="12"/><line x1="3" x2="21" y1="6" y2="6"/><line x1="3" x2="21" y1="18" y2="18"/></svg>
                    </button>
                    <h1 className="text-xl md:text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-brand-teal to-brand-brown-dark">
                        {settings?.companyName || 'Geetha Tex'} 🧵
                    </h1>
                </div>
                <div className="flex items-center space-x-4">
                    <p className="hidden md:block font-semibold text-brand-text dark:text-brand-text-dark">Admin</p>
                    <button
                        onClick={toggleTheme}
                        className="p-2 rounded-full text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                        aria-label="Toggle theme"
                    >
                        {theme === 'light' ? <MoonIcon /> : <SunIcon />}
                    </button>
                </div>
            </div>
        </header>
    );
};

const Sidebar: React.FC<{ currentPage: Page; setCurrentPage: (page: Page) => void; isOpen: boolean; setIsOpen: (isOpen: boolean) => void; }> = ({ currentPage, setCurrentPage, isOpen, setIsOpen }) => {
    const navItems = [
        { id: 'dashboard', label: 'Dashboard', icon: <DashboardIcon /> },
        { id: 'machines', label: 'Machines', icon: <MachineIcon /> },
        { id: 'reports', label: 'Monthly Reports', icon: <ReportsIcon /> },
        { id: 'userDetails', label: 'Batch Details', icon: <UserIcon /> },
        { id: 'settings', label: 'Settings', icon: <SettingsIcon /> },
    ];

    return (
        <>
            <div className={`fixed inset-0 bg-black/30 z-40 lg:hidden transition-opacity ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={() => setIsOpen(false)}></div>
            <aside className={`fixed lg:sticky top-0 h-screen bg-white dark:bg-slate-800 shadow-xl z-50 w-64 flex-shrink-0 flex flex-col transition-transform transform ${isOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}>
                <div className="p-4 h-16 flex items-center justify-between border-b dark:border-slate-700">
                    <h2 className="text-lg font-semibold text-brand-text dark:text-brand-text-dark">Geetha Tex</h2>
                    <button onClick={() => setIsOpen(false)} className="lg:hidden p-1 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700"><ChevronLeftIcon /></button>
                </div>
                <nav className="p-4 flex-grow">
                    <ul>
                        {navItems.map(item => (
                            <li key={item.id} className="mb-2">
                                <button
                                    onClick={() => { setCurrentPage(item.id as Page); setIsOpen(false); }}
                                    className={`w-full flex items-center space-x-3 px-4 py-2.5 rounded-lg font-semibold text-left transition-all duration-200 ${
                                        currentPage === item.id
                                            ? 'bg-brand-teal text-white shadow-lg'
                                            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 hover:translate-x-1'
                                    }`}
                                >
                                    {item.icon}
                                    <span>{item.label}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                </nav>
            </aside>
        </>
    );
};

// ==================================
//      PAGE & FEATURE COMPONENTS
// ==================================

const StatCard: React.FC<{ title: string; value: string | number; icon: React.ReactNode, onClick?: () => void }> = ({ title, value, icon, onClick }) => (
    <div onClick={onClick} className={`bg-white dark:bg-slate-800 p-6 rounded-xl shadow-lg flex items-center space-x-4 border border-slate-200 dark:border-slate-700 ${onClick ? 'cursor-pointer hover:shadow-xl hover:border-brand-teal transition-all' : ''}`}>
        <div className="bg-brand-teal/10 dark:bg-brand-teal/20 text-brand-teal dark:text-brand-teal-light p-3 rounded-full">
            {icon}
        </div>
        <div>
            <p className="text-sm text-slate-500 dark:text-slate-400">{title}</p>
            <p className="text-2xl font-bold text-brand-text dark:text-brand-text-dark">{value}</p>
        </div>
    </div>
);

const AddBatchModal: React.FC<{ isOpen: boolean; onClose: () => void; machineNumber?: number; }> = ({ isOpen, onClose, machineNumber }) => {
    const { addBatch, settings, batchTypes } = useAppContext();
    const [formData, setFormData] = useState({ batchNumber: '', machineNumber: '1', startDate: getTodayDateString(), endDate: getTodayDateString(), meterValue: '', color: '#f59e0b' });
    const [errors, setErrors] = useState({ meterValue: '' });

    useEffect(() => {
        if (isOpen && batchTypes.length > 0) {
            const firstBatchType = batchTypes[0];
            setFormData({
                batchNumber: firstBatchType.batchNumber,
                machineNumber: machineNumber ? String(machineNumber) : '1',
                startDate: getTodayDateString(),
                endDate: getTodayDateString(),
                meterValue: '',
                color: firstBatchType.color
            });
            setErrors({ meterValue: '' });
        } else if (isOpen) {
             setFormData({
                batchNumber: '',
                machineNumber: machineNumber ? String(machineNumber) : '1',
                startDate: getTodayDateString(),
                endDate: getTodayDateString(),
                meterValue: '',
                color: '#f59e0b'
            });
        }
    }, [isOpen, machineNumber, batchTypes]);

    const handleBatchNumberChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const selectedBatchNumber = e.target.value;
        const selectedBatchType = batchTypes.find(bt => bt.batchNumber === selectedBatchNumber);
        setFormData({
            ...formData,
            batchNumber: selectedBatchNumber,
            color: selectedBatchType ? selectedBatchType.color : '#f59e0b'
        });
    };

    const validate = () => {
        const newErrors = { meterValue: '' };
        let isValid = true;
        if (!formData.meterValue || isNaN(Number(formData.meterValue)) || Number(formData.meterValue) <= 0) {
            newErrors.meterValue = 'Enter a valid meter value.';
            isValid = false;
        }
        setErrors(newErrors);
        return isValid;
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (validate()) {
            addBatch({
                ...formData,
                batchNumber: formData.batchNumber.toUpperCase(),
                machineNumber: Number(formData.machineNumber),
                meterValue: Number(formData.meterValue),
            });
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl p-6 w-full max-w-md m-4" onClick={e => e.stopPropagation()}>
                <h2 className="text-2xl font-bold mb-4 text-brand-text dark:text-brand-text-dark">Add New Batch Run</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                     {batchTypes.length > 0 ? (
                        <div>
                          <label className="text-sm text-slate-500 dark:text-slate-400">Batch Number</label>
                          <select value={formData.batchNumber} onChange={handleBatchNumberChange} className="w-full p-2 border rounded bg-slate-50 dark:bg-slate-700 dark:border-slate-600" required>
                            {batchTypes.map(bt => (
                              <option key={bt.id} value={bt.batchNumber}>{bt.batchNumber}</option>
                            ))}
                          </select>
                        </div>
                    ) : (
                        <div className="text-center p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg text-sm text-yellow-700 dark:text-yellow-300">
                            No batch types found. Please add one on the "Batch Details" page first.
                        </div>
                    )}
                    <input type="number" placeholder="Meter Value" value={formData.meterValue} onChange={e => setFormData({ ...formData, meterValue: e.target.value })} className="w-full p-2 border rounded bg-slate-50 dark:bg-slate-700 dark:border-slate-600" required />
                    {errors.meterValue && <p className="text-red-500 text-xs">{errors.meterValue}</p>}
                    <div>
                      <label className="text-sm text-slate-500 dark:text-slate-400">Machine</label>
                      <select value={formData.machineNumber} onChange={e => setFormData({ ...formData, machineNumber: e.target.value })} className="w-full p-2 border rounded bg-slate-50 dark:bg-slate-700 dark:border-slate-600">
                        {Array.from({length: settings?.numberOfMachines || 1}, (_, i) => i + 1).map(num => (
                          <option key={num} value={num}>Machine #{num}</option>
                        ))}
                      </select>
                    </div>
                     <div className="flex items-center space-x-3">
                        <label className="text-sm text-slate-500 dark:text-slate-400">Batch Color</label>
                        <input type="color" value={formData.color} onChange={e => setFormData({ ...formData, color: e.target.value })} className="h-8 w-14 p-0.5 border rounded bg-slate-50 dark:bg-slate-700 dark:border-slate-600 cursor-pointer" />
                    </div>
                     <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-sm text-slate-500 dark:text-slate-400">Start Date</label>
                            <input type="date" value={formData.startDate} onChange={e => setFormData({ ...formData, startDate: e.target.value })} className="w-full p-2 border rounded bg-slate-50 dark:bg-slate-700 dark:border-slate-600" />
                        </div>
                        <div>
                            <label className="text-sm text-slate-500 dark:text-slate-400">End Date</label>
                            <input type="date" value={formData.endDate} onChange={e => setFormData({ ...formData, endDate: e.target.value })} className="w-full p-2 border rounded bg-slate-50 dark:bg-slate-700 dark:border-slate-600" />
                        </div>
                    </div>
                    <div className="flex justify-end space-x-3 pt-4">
                        <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 font-semibold">Cancel</button>
                        <button type="submit" disabled={batchTypes.length === 0} className="px-4 py-2 rounded-lg bg-brand-teal text-white hover:bg-brand-teal-dark font-semibold shadow disabled:opacity-50 disabled:cursor-not-allowed">Add Batch</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const EditBatchModal: React.FC<{ isOpen: boolean; onClose: () => void; batchToEdit: Batch | null; existingBatchNumbers: string[] }> = ({ isOpen, onClose, batchToEdit, existingBatchNumbers }) => {
    const { updateBatch, settings } = useAppContext();
    const [formData, setFormData] = useState<Omit<Batch, 'status'> | null>(null);
    const [errors, setErrors] = useState({ batchNumber: '', meterValue: '' });

    useEffect(() => {
        if (batchToEdit) {
            const { status, ...rest } = batchToEdit;
            setFormData(rest);
        }
    }, [batchToEdit]);

    const validate = () => {
        if (!formData) return false;
        const newErrors = { batchNumber: '', meterValue: '' };
        let isValid = true;
        if (existingBatchNumbers.includes(formData.batchNumber.trim().toUpperCase()) && formData.batchNumber.toUpperCase() !== batchToEdit?.batchNumber.toUpperCase()) {
            newErrors.batchNumber = 'Batch number must be unique.';
            isValid = false;
        }
        if (!formData.batchNumber.trim()) {
            newErrors.batchNumber = 'Batch number is required.';
            isValid = false;
        }
        if (isNaN(Number(formData.meterValue)) || Number(formData.meterValue) <= 0) {
            newErrors.meterValue = 'Enter a valid meter value.';
            isValid = false;
        }
        setErrors(newErrors);
        return isValid;
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (formData && validate()) {
            updateBatch({
                ...formData,
                status: batchToEdit!.status, // Preserve original status
                batchNumber: formData.batchNumber.toUpperCase(),
                machineNumber: Number(formData.machineNumber),
                meterValue: Number(formData.meterValue),
            });
            onClose();
        }
    };

    if (!isOpen || !formData) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl p-6 w-full max-w-md m-4" onClick={e => e.stopPropagation()}>
                <h2 className="text-2xl font-bold mb-4 text-brand-text dark:text-brand-text-dark">Edit Batch</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <input type="text" placeholder="Batch Number" value={formData.batchNumber} onChange={e => setFormData({ ...formData, batchNumber: e.target.value })} className="w-full p-2 border rounded bg-slate-50 dark:bg-slate-700 dark:border-slate-600" required />
                    {errors.batchNumber && <p className="text-red-500 text-xs">{errors.batchNumber}</p>}
                    <input type="number" placeholder="Meter Value" value={formData.meterValue} onChange={e => setFormData({ ...formData, meterValue: Number(e.target.value) })} className="w-full p-2 border rounded bg-slate-50 dark:bg-slate-700 dark:border-slate-600" required />
                    {errors.meterValue && <p className="text-red-500 text-xs">{errors.meterValue}</p>}
                    <div>
                        <label className="text-sm text-slate-500">Machine</label>
                        <select value={formData.machineNumber} onChange={e => setFormData({ ...formData, machineNumber: Number(e.target.value) })} className="w-full p-2 border rounded bg-slate-50 dark:bg-slate-700 dark:border-slate-600">
                          {Array.from({length: settings?.numberOfMachines || 1}, (_, i) => i + 1).map(num => (
                            <option key={num} value={num}>Machine #{num}</option>
                          ))}
                        </select>
                    </div>
                    <div className="flex items-center space-x-3">
                        <label className="text-sm text-slate-500">Batch Color</label>
                        <input type="color" value={formData.color} onChange={e => setFormData({ ...formData, color: e.target.value })} className="h-8 w-14 p-0.5 border rounded bg-slate-50 dark:bg-slate-700 dark:border-slate-600 cursor-pointer" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-sm text-slate-500">Start Date</label>
                            <input type="date" value={formData.startDate} onChange={e => setFormData({ ...formData, startDate: e.target.value })} className="w-full p-2 border rounded bg-slate-50 dark:bg-slate-700 dark:border-slate-600" />
                        </div>
                        <div>
                            <label className="text-sm text-slate-500">End Date</label>
                            <input type="date" value={formData.endDate} onChange={e => setFormData({ ...formData, endDate: e.target.value })} className="w-full p-2 border rounded bg-slate-50 dark:bg-slate-700 dark:border-slate-600" />
                        </div>
                    </div>
                    <div className="flex justify-end space-x-3 pt-4">
                        <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 font-semibold">Cancel</button>
                        <button type="submit" className="px-4 py-2 rounded-lg bg-brand-teal text-white hover:bg-brand-teal-dark font-semibold shadow">Save Changes</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const CalculatorModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
    const [input, setInput] = useState('0');
    const [operator, setOperator] = useState<string | null>(null);
    const [previousValue, setPreviousValue] = useState<number | null>(null);

    const handleInput = (value: string) => {
        if (input === '0' && value !== '.') {
            setInput(value);
        } else if (value === '.' && input.includes('.')) {
            return;
        } else {
            setInput(input + value);
        }
    };

    const handleOperator = (op: string) => {
        if (previousValue !== null) {
            handleEquals(); // Calculate intermediate result
        }
        setPreviousValue(parseFloat(input));
        setOperator(op);
        setInput('0');
    };

    const handleEquals = () => {
        if (operator && previousValue !== null) {
            const currentValue = parseFloat(input);
            let result;
            switch (operator) {
                case '+': result = previousValue + currentValue; break;
                case '-': result = previousValue - currentValue; break;
                case '*': result = previousValue * currentValue; break;
                case '/': result = previousValue / currentValue; break;
                default: return;
            }
            setInput(String(result));
            setOperator(null);
            setPreviousValue(null);
        }
    };
    
    const handleClear = () => {
        setInput('0');
        setOperator(null);
        setPreviousValue(null);
    };

    if (!isOpen) return null;

    const Button = ({ onClick, children, className = '' }: { onClick: () => void; children: React.ReactNode, className?: string }) => (
        <button onClick={onClick} className={`bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded-lg font-bold text-xl p-4 transition-colors ${className}`}>
            {children}
        </button>
    );

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl p-4 w-full max-w-xs m-4" onClick={e => e.stopPropagation()}>
                <div className="bg-slate-100 dark:bg-slate-900 rounded-lg p-4 text-right text-3xl font-mono mb-4 break-all">{input}</div>
                <div className="grid grid-cols-4 gap-2">
                    <Button onClick={handleClear} className="col-span-2 bg-red-500/80 hover:bg-red-500 text-white">C</Button>
                    <Button onClick={() => {}} className="bg-slate-300 dark:bg-slate-600">DEL</Button>
                    <Button onClick={() => handleOperator('/')} className="bg-brand-teal/80 hover:bg-brand-teal text-white">/</Button>
                    <Button onClick={() => handleInput('7')}>7</Button>
                    <Button onClick={() => handleInput('8')}>8</Button>
                    <Button onClick={() => handleInput('9')}>9</Button>
                    <Button onClick={() => handleOperator('*')} className="bg-brand-teal/80 hover:bg-brand-teal text-white">*</Button>
                    <Button onClick={() => handleInput('4')}>4</Button>
                    <Button onClick={() => handleInput('5')}>5</Button>
                    <Button onClick={() => handleInput('6')}>6</Button>
                    <Button onClick={() => handleOperator('-')} className="bg-brand-teal/80 hover:bg-brand-teal text-white">-</Button>
                    <Button onClick={() => handleInput('1')}>1</Button>
                    <Button onClick={() => handleInput('2')}>2</Button>
                    <Button onClick={() => handleInput('3')}>3</Button>
                    <Button onClick={() => handleOperator('+')} className="bg-brand-teal/80 hover:bg-brand-teal text-white">+</Button>
                    <Button onClick={() => handleInput('0')} className="col-span-2">0</Button>
                    <Button onClick={() => handleInput('.')}>.</Button>
                    <Button onClick={handleEquals} className="bg-brand-teal text-white">=</Button>
                </div>
            </div>
        </div>
    );
};

const BatchCalendar: React.FC<{ batches: Batch[] }> = ({ batches }) => {
    const [currentDate, setCurrentDate] = useState(new Date());

    const changeMonth = (amount: number) => {
        setCurrentDate(prev => {
            const newDate = new Date(prev);
            newDate.setMonth(newDate.getMonth() + amount);
            return newDate;
        });
    };

    const calendarData = useMemo(() => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const firstDayOfMonth = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        
        const batchesByDate = new Map<string, Batch[]>();
        batches.forEach(batch => {
            const date = new Date(batch.startDate);
            // Check if batch is in the current month view
            if (date.getFullYear() === year && date.getMonth() === month) {
                 const dateString = batch.startDate;
                 if (!batchesByDate.has(dateString)) {
                     batchesByDate.set(dateString, []);
                 }
                 batchesByDate.get(dateString)?.push(batch);
            }
        });

        return { year, month, firstDayOfMonth, daysInMonth, batchesByDate };
    }, [currentDate, batches]);

    const days = Array.from({ length: calendarData.firstDayOfMonth }, (_, i) => <div key={`empty-${i}`} className="border-r border-b dark:border-slate-700"></div>);

    for (let day = 1; day <= calendarData.daysInMonth; day++) {
        const dateString = `${calendarData.year}-${String(calendarData.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayBatches = calendarData.batchesByDate.get(dateString) || [];
        const isToday = new Date().toDateString() === new Date(calendarData.year, calendarData.month, day).toDateString();
        
        days.push(
            <div key={day} className="border-r border-b dark:border-slate-700 p-2 h-28 flex flex-col relative text-brand-text dark:text-brand-text-dark">
                <span className={`text-sm font-semibold ${isToday ? 'bg-brand-teal text-white rounded-full h-6 w-6 flex items-center justify-center' : ''}`}>{day}</span>
                <div className="flex flex-col items-start mt-1 space-y-1 overflow-hidden">
                    {dayBatches.slice(0, 2).map(b => (
                        <div key={b.id} title={`${b.batchNumber}: ${b.name}`} className="flex items-center w-full text-xs p-1 rounded-md" style={{backgroundColor: `${b.color}20`}}>
                             <span className="w-2 h-2 rounded-full mr-1.5 flex-shrink-0" style={{ backgroundColor: b.color }}></span>
                             <span className="truncate font-medium">{b.batchNumber}</span>
                        </div>
                    ))}
                    {dayBatches.length > 2 && <div className="text-xs text-slate-500 self-center mt-1">+ {dayBatches.length - 2} more</div>}
                </div>
            </div>
        );
    }
    
    const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    return (
        <div className="bg-white dark:bg-slate-800 p-4 sm:p-6 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-semibold text-brand-text dark:text-brand-text-dark">{currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}</h3>
                <div className="flex space-x-2">
                    <button onClick={() => changeMonth(-1)} className="p-2 rounded-full text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"><ChevronLeftIcon /></button>
                    <button onClick={() => changeMonth(1)} className="p-2 rounded-full text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"><ChevronRightIcon /></button>
                </div>
            </div>
            <div className="grid grid-cols-7 text-center font-bold text-sm text-slate-500 dark:text-slate-400">
                {weekDays.map(day => <div key={day} className="py-2 border-b-2 dark:border-slate-700">{day}</div>)}
            </div>
             <div className="grid grid-cols-7">
                {days}
             </div>
        </div>
    );
};

const DashboardPage: React.FC<{ calculatedBatches: CalculatedBatch[]; onNavigate: (page: Page) => void; }> = ({ calculatedBatches, onNavigate }) => {
    const stats = useMemo(() => {
        const totalFtotal = calculatedBatches.reduce((sum, b) => sum + b.ftotal, 0);
        return {
            overallFtotal: totalFtotal,
        };
    }, [calculatedBatches]);

    return (
        <div className="space-y-8">
             <div>
                <h2 className="text-3xl font-bold text-brand-text dark:text-brand-text-dark">Dashboard</h2>
                <p className="text-slate-500 dark:text-slate-400 mt-1">High-level overview of your production.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <StatCard title="Overall FTotal" value={stats.overallFtotal} icon={<ReportsIcon/>} />
            </div>

            <div className="bg-white dark:bg-slate-800 p-4 sm:p-6 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700">
                <h3 className="text-xl font-semibold text-brand-text dark:text-brand-text-dark mb-4">Batch Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {calculatedBatches.map(batch => (
                        <div key={batch.id} className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4 border dark:border-slate-700 space-y-2">
                            <div className="flex justify-between items-center">
                                <div className="flex items-center space-x-2">
                                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: batch.color || '#cccccc' }}></span>
                                    <p className="font-bold text-lg truncate" title={batch.batchNumber}>{batch.batchNumber}</p>
                                </div>
                                <p className="text-sm text-slate-500 font-mono" title={`Machine #${batch.machineNumber}`}>#{batch.machineNumber}</p>
                            </div>
                            <div className="grid grid-cols-2 gap-4 pt-2 border-t dark:border-slate-700 text-center">
                                <div>
                                    <p className="text-xs text-slate-500">FTotal</p>
                                    <p className="font-semibold text-lg">{batch.ftotal}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-slate-500">Average (MTotal)</p>
                                    <p className="font-semibold text-lg">{batch.average.toFixed(2)}</p>
                                </div>
                            </div>
                        </div>
                    ))}
                    {calculatedBatches.length === 0 && (
                        <div className="col-span-full text-center p-4 text-slate-500">No batches available. Add one to get started!</div>
                    )}
                </div>
            </div>
        </div>
    );
};

const MachineCard: React.FC<{
  machineNumber: number;
  batches: CalculatedBatch[];
  onEditBatch: (batch: CalculatedBatch) => void;
  onDeleteBatch: (batchId: string) => void;
}> = ({ machineNumber, batches, onEditBatch, onDeleteBatch }) => {
    const latestBatch = batches.length > 0 ? batches[0] : null;
    const { settings } = useAppContext();
    return (
        <div className="bg-white dark:bg-slate-800 p-4 sm:p-6 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-4 gap-4">
                <h3 className="text-2xl font-bold text-brand-text dark:text-brand-text-dark">Machine #{machineNumber}</h3>
                <div className="flex items-center space-x-2">
                    <button onClick={() => exportMachineReportAsCsv(machineNumber, batches)} className="text-sm flex items-center space-x-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 font-semibold px-3 py-2 rounded-lg">
                        <DownloadIcon /> <span>Download</span>
                    </button>
                </div>
            </div>
            
            {latestBatch ? (
                <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4 mb-4 border dark:border-slate-700">
                    <p className="text-sm text-slate-500">Latest / Active Batch</p>
                    <div className="flex items-center justify-between mt-1">
                        <p className="font-bold text-lg">{latestBatch.batchNumber}</p>
                    </div>
                    <div className="grid grid-cols-3 gap-4 mt-3 pt-3 border-t dark:border-slate-700 text-center">
                        <div>
                            <p className="text-sm text-slate-500">Meter Value</p>
                            <p className="font-semibold text-lg">{latestBatch.meterValue.toFixed(2)}m</p>
                        </div>
                         <div>
                            <p className="text-sm text-slate-500">FTotal</p>
                            <p className="font-semibold text-lg">{latestBatch.ftotal}</p>
                        </div>
                         <div>
                            <p className="text-sm text-slate-500">Average (MTotal)</p>
                            <p className="font-semibold text-lg">{latestBatch.average.toFixed(2)}</p>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="text-center p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg text-slate-500">No batches assigned to this machine yet.</div>
            )}

            <h4 className="font-semibold mt-6 mb-2">Batch History</h4>
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="text-xs text-slate-500 uppercase bg-slate-50 dark:bg-slate-700 dark:text-slate-400">
                        <tr>
                            <th className="p-3">Batch No</th><th className="p-3">FTotal</th>
                            <th className="p-3">End Date</th><th className="p-3 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {batches.map(batch => (
                            <tr key={batch.id} className="border-b dark:border-slate-700">
                                <td className="p-3 font-medium">{batch.batchNumber}</td>
                                <td className="p-3">{batch.ftotal}</td>
                                <td className="p-3">{batch.endDate}</td>
                                <td className="p-3 text-right">
                                    <div className="flex items-center justify-end space-x-1">
                                        <button onClick={() => onEditBatch(batch)} title="Edit Batch" className="p-1.5 text-slate-500 hover:text-blue-500 rounded-full hover:bg-slate-100 dark:hover:bg-slate-600"><EditIcon /></button>
                                        <button onClick={() => onDeleteBatch(batch.id)} title="Delete Batch" className="p-1.5 text-slate-500 hover:text-red-500 rounded-full hover:bg-slate-100 dark:hover:bg-slate-600"><DeleteIcon /></button>
                                        <button onClick={() => generateBillPdf(batch, settings!)} title="Generate Bill" className="p-1.5 text-slate-500 hover:text-brand-teal rounded-full hover:bg-slate-100 dark:hover:bg-slate-600">
                                            <ReceiptIcon />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const MachinesPage: React.FC<{ 
    calculatedBatches: CalculatedBatch[],
    onEditBatch: (batch: CalculatedBatch) => void,
    onDeleteBatch: (batchId: string) => void
}> = ({ calculatedBatches, onEditBatch, onDeleteBatch }) => {
    const { settings } = useAppContext();
    if (!settings) return null;

    const batchesByMachine = useMemo(() => {
        return Array.from({ length: settings.numberOfMachines }, (_, i) => i + 1)
            .map(machineNumber => ({
                machineNumber,
                batches: calculatedBatches.filter(b => b.machineNumber === machineNumber)
            }));
    }, [calculatedBatches, settings.numberOfMachines]);
    
    return (
        <div className="space-y-8">
            <div>
                <h2 className="text-3xl font-bold text-brand-text dark:text-brand-text-dark">Machines Overview</h2>
                <p className="text-slate-500 dark:text-slate-400 mt-1">Manage batches and view performance for each machine.</p>
            </div>
            <div className="space-y-6">
                {batchesByMachine.map(({ machineNumber, batches }) => (
                    <MachineCard 
                        key={machineNumber}
                        machineNumber={machineNumber}
                        batches={batches}
                        onEditBatch={onEditBatch}
                        onDeleteBatch={onDeleteBatch}
                    />
                ))}
            </div>
        </div>
    );
};

const SimpleMarkdown: React.FC<{ content: string }> = ({ content }) => {
    // This simple renderer handles basic markdown formatting.
    // It's not a full-fledged parser but works for the expected AI output.
    const createMarkup = (text: string) => {
        const html = text
            // Headers
            .replace(/^### (.*$)/gim, '<h3 class="text-lg font-semibold mt-3 mb-1">$1</h3>')
            .replace(/^## (.*$)/gim, '<h2 class="text-xl font-bold mt-4 mb-2">$1</h2>')
            // Bold
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            // Unordered list items
            .replace(/^\* (.*$)/gim, '<li class="ml-4 list-disc">$1</li>')
            // Newlines
            .replace(/\n/g, '<br />')
            // Clean up extra breaks around list items
            .replace(/<br \/><li/g, '<li')
            .replace(/<\/li><br \/>/g, '</li>');

        return { __html: html };
    };

    return <div className="prose prose-sm dark:prose-invert max-w-none" dangerouslySetInnerHTML={createMarkup(content)} />;
};

const ReportsPage: React.FC<{ calculatedBatches: CalculatedBatch[] }> = ({ calculatedBatches }) => {
    const { settings, setNotification } = useAppContext();
    const [currentDate, setCurrentDate] = useState(new Date());

    const [aiSummary, setAiSummary] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [aiError, setAiError] = useState<string | null>(null);

    const monthBatches = useMemo(() => {
        return calculatedBatches.filter(b => {
            const batchDate = new Date(b.startDate);
            return batchDate.getFullYear() === currentDate.getFullYear() && batchDate.getMonth() === currentDate.getMonth();
        });
    }, [calculatedBatches, currentDate]);
    
    const monthlyReport = useMemo((): Omit<MonthlyReport, 'statusCounts'> => {
        const totalBatches = monthBatches.length;
        const totalMeter = monthBatches.reduce((sum, b) => sum + b.meterValue, 0);
        const totalFtotal = monthBatches.reduce((sum, b) => sum + b.ftotal, 0);
        return {
            month: currentDate.toLocaleString('default', { month: 'long', year: 'numeric' }),
            totalBatches, totalMeter, totalFtotal, topMachine: null
        };
    }, [monthBatches, currentDate]);

    const changeMonth = (amount: number) => {
        setCurrentDate(prev => {
            const newDate = new Date(prev);
            newDate.setMonth(newDate.getMonth() + amount);
            return newDate;
        });
        setAiSummary('');
        setAiError(null);
    };

    const handleGenerateSummary = async () => {
        if (!settings) return;
        setIsGenerating(true);
        setAiError(null);
        setAiSummary('');

        try {
            const ai = new GoogleGenAI({apiKey: process.env.API_KEY});
            const prompt = `You are a production manager assistant for a textile company called '${settings.companyName}'.
    Analyze the following data for ${monthlyReport.month} and provide a concise, insightful summary for the business owner.
    Focus on key performance indicators, highlight successes, and identify potential areas for improvement.
    Use Markdown for formatting, including headers, bold text, and bullet points.
    
    **Monthly Report Data:**
    - Total Batches: ${monthlyReport.totalBatches}
    - Total Meter Processed: ${monthlyReport.totalMeter.toFixed(2)}m
    - Total FTotal: ${monthlyReport.totalFtotal}
    
    **Batches processed this month:**
    ${monthBatches.length > 0 ? monthBatches.map(b => `- Batch ${b.batchNumber} (Machine #${b.machineNumber}): ${b.ftotal} FTotal`).join('\n') : 'No batches were processed this month.'}
    
    Please provide your analysis:`;
            
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
            });
    
            setAiSummary(response.text);
    
        } catch (e) {
            console.error(e);
            const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
            setAiError(`Failed to generate AI summary. Please check your connection or API key. Error: ${errorMessage}`);
            setNotification('Error generating AI summary.');
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="space-y-8">
            <div>
                <h2 className="text-3xl font-bold text-brand-text dark:text-brand-text-dark">Monthly Reports</h2>
                <p className="text-slate-500 dark:text-slate-400 mt-1">Analyze performance month by month.</p>
            </div>
            
            <BatchCalendar batches={calculatedBatches} />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <StatCard title="Total Batches" value={monthlyReport.totalBatches} icon={<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v2"/></svg>} />
                <StatCard title="Total FTotal" value={monthlyReport.totalFtotal} icon={<ReportsIcon/>} />
            </div>

            <div className="bg-white dark:bg-slate-800 p-4 sm:p-6 rounded-xl shadow-lg border">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-semibold flex items-center space-x-2 text-brand-text dark:text-brand-text-dark">
                        <BrainIcon />
                        <span>AI-Powered Analysis</span>
                    </h3>
                    <button onClick={handleGenerateSummary} disabled={isGenerating} className="text-sm flex items-center space-x-2 bg-brand-teal/10 hover:bg-brand-teal/20 text-brand-teal-dark font-semibold px-3 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed">
                        {isGenerating ? 'Generating...' : 'Generate Analysis'}
                    </button>
                </div>
                {isGenerating && <div className="text-center p-4 text-slate-500">Generating summary, this may take a moment...</div>}
                {aiError && <div className="text-center p-4 text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg">{aiError}</div>}
                {aiSummary && (
                    <div className="p-2 border-t dark:border-slate-700 mt-4">
                        <SimpleMarkdown content={aiSummary} />
                    </div>
                )}
            </div>

            <div className="bg-white dark:bg-slate-800 p-4 sm:p-6 rounded-xl shadow-lg border">
                 <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-semibold">Batches this Month</h3>
                    <button onClick={() => exportReportAsCsv(monthlyReport as MonthlyReport, monthBatches)} className="text-sm flex items-center space-x-2 bg-brand-teal/10 hover:bg-brand-teal/20 text-brand-teal-dark font-semibold px-3 py-2 rounded-lg">
                        <DownloadIcon />
                        <span>Export to Excel</span>
                    </button>
                 </div>
                <div className="overflow-x-auto">
                   <table className="w-full text-sm text-left">
                     <thead className="text-xs text-slate-500 uppercase bg-slate-50 dark:bg-slate-700">
                        <tr>
                            <th className="p-3">Batch No</th><th className="p-3">Machine</th>
                            <th className="p-3">FTotal</th><th className="p-3">End Date</th>
                        </tr>
                     </thead>
                      <tbody>
                        {monthBatches.map(batch => (
                            <tr key={batch.id} className="border-b dark:border-slate-700">
                                <td className="p-3 font-medium">{batch.batchNumber}</td>
                                <td className="p-3">Machine #{batch.machineNumber}</td>
                                <td className="p-3">{batch.ftotal}</td>
                                <td className="p-3">{batch.endDate}</td>
                            </tr>
                        ))}
                        {monthBatches.length === 0 && (
                            <tr><td colSpan={4} className="text-center p-4 text-slate-500">No batches recorded for this month.</td></tr>
                        )}
                      </tbody>
                   </table>
                </div>
            </div>
        </div>
    );
};


const UserDetailsPage: React.FC = () => {
    const { batchTypes, addBatchType, updateBatchType, deleteBatchType, setNotification } = useAppContext();
    const [newBatchNumber, setNewBatchNumber] = useState('');
    const [newBatchColor, setNewBatchColor] = useState('#14b8a6');

    const existingBatchNumbers = useMemo(() => batchTypes.map(bt => bt.batchNumber.toUpperCase()), [batchTypes]);

    const handleAddBatchType = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newBatchNumber.trim()) {
            setNotification("Batch number cannot be empty.");
            return;
        }
        if (existingBatchNumbers.includes(newBatchNumber.trim().toUpperCase())) {
            setNotification("Batch number must be unique.");
            return;
        }
        addBatchType({ batchNumber: newBatchNumber.trim().toUpperCase(), color: newBatchColor });
        setNewBatchNumber('');
        setNewBatchColor('#14b8a6');
    };

    const handleUpdateColor = (id: string, color: string) => {
        const batchType = batchTypes.find(bt => bt.id === id);
        if (batchType) {
            updateBatchType({ ...batchType, color });
        }
    };

    const handleDelete = (id: string) => {
        if (window.confirm('Are you sure you want to delete this batch type? This cannot be undone.')) {
            deleteBatchType(id);
        }
    };

    return (
        <div className="space-y-8">
            <div>
                <h2 className="text-3xl font-bold text-brand-text dark:text-brand-text-dark">Batch Details Management</h2>
                <p className="text-slate-500 dark:text-slate-400 mt-1">Add, edit, or remove batch types for your production runs.</p>
            </div>

            <form onSubmit={handleAddBatchType} className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-lg border space-y-4">
                <h3 className="font-bold text-lg mb-2">Add New Batch Type</h3>
                <div className="flex flex-col md:flex-row md:items-end md:space-x-4 space-y-4 md:space-y-0">
                    <div className="flex-grow">
                        <label className="font-semibold text-sm">New Batch Number</label>
                        <input type="text" placeholder="e.g. SUMMER-RUN-01" value={newBatchNumber} onChange={e => setNewBatchNumber(e.target.value)} className="w-full mt-1 p-2 border rounded bg-slate-50 dark:bg-slate-700 dark:border-slate-600" />
                    </div>
                    <div>
                        <label className="font-semibold text-sm">Default Color</label>
                        <input type="color" value={newBatchColor} onChange={e => setNewBatchColor(e.target.value)} className="w-full h-10 mt-1 p-1 border rounded bg-slate-50 dark:bg-slate-700 dark:border-slate-600" />
                    </div>
                    <button type="submit" className="px-6 py-2 rounded-lg bg-brand-teal text-white hover:bg-brand-teal-dark font-semibold shadow h-10">Add Batch Type</button>
                </div>
            </form>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {batchTypes.map(bt => (
                    <div key={bt.id} className="bg-white dark:bg-slate-800 p-4 rounded-lg shadow-lg border flex flex-col justify-between">
                        <div>
                           <p className="font-bold text-lg text-brand-text dark:text-brand-text-dark">{bt.batchNumber}</p>
                           <div className="flex items-center space-x-2 mt-3">
                               <label htmlFor={`color-${bt.id}`} className="text-sm text-slate-500">Color:</label>
                               <input 
                                   id={`color-${bt.id}`}
                                   type="color" 
                                   value={bt.color} 
                                   onChange={e => handleUpdateColor(bt.id, e.target.value)} 
                                   onBlur={() => setNotification(`${bt.batchNumber} color updated.`)}
                                   className="h-8 w-14 p-0.5 border rounded bg-slate-50 dark:bg-slate-700 dark:border-slate-600 cursor-pointer"
                               />
                           </div>
                        </div>
                       <div className="text-right mt-4">
                           <button onClick={() => handleDelete(bt.id)} className="text-xs font-semibold text-red-500 hover:text-red-700 dark:hover:text-red-400">
                               Delete
                           </button>
                       </div>
                    </div>
                ))}
                {batchTypes.length === 0 && <p className="col-span-full text-center text-slate-500 p-4">No batch types defined yet.</p>}
            </div>
        </div>
    );
};

const SettingsPage: React.FC = () => {
    const { settings, batches, setSettings, setBatches, setNotification } = useAppContext();
    const [formData, setFormData] = useState({ companyName: '', numberOfMachines: 0 });

    useEffect(() => {
        if (settings) {
            setFormData(settings);
        }
    }, [settings]);
    
    const handleSettingsSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setSettings(formData);
        setNotification('Company settings updated successfully!');
    };

    const handleBackup = () => {
        if (settings) {
            backupDataAsJson(settings, batches);
            setNotification('Data backup downloaded!');
        }
    };

    const handleReset = () => {
        if (window.confirm('Are you sure you want to reset all data? This will clear all settings and batches.')) {
            setSettings(null);
            setBatches([]);
        }
    };

    return (
         <div className="space-y-8 max-w-2xl">
            <div>
                <h2 className="text-3xl font-bold text-brand-text dark:text-brand-text-dark">Settings</h2>
                <p className="text-slate-500 dark:text-slate-400 mt-1">Manage company details and application data.</p>
            </div>

            <form onSubmit={handleSettingsSubmit} className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-lg border space-y-4">
                 <h3 className="font-bold text-lg">Company Settings</h3>
                 <div>
                    <label className="font-semibold">Company Name</label>
                    <input type="text" value={formData.companyName} onChange={e => setFormData({...formData, companyName: e.target.value})} className="w-full mt-1 p-2 border rounded bg-slate-50 dark:bg-slate-700 dark:border-slate-600" />
                </div>
                 <div>
                    <label className="font-semibold">Number of Machines</label>
                    <input type="number" min="1" value={formData.numberOfMachines} onChange={e => setFormData({...formData, numberOfMachines: Number(e.target.value)})} className="w-full mt-1 p-2 border rounded bg-slate-50 dark:bg-slate-700 dark:border-slate-600" />
                </div>
                <div className="text-right">
                    <button type="submit" className="px-6 py-2 rounded-lg bg-brand-teal text-white hover:bg-brand-teal-dark font-semibold shadow">Save Settings</button>
                </div>
            </form>

             <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-lg border space-y-4">
                <h3 className="font-bold text-lg">Data Management</h3>
                <div className="flex items-center justify-between">
                    <p>Backup all your settings and batch data to a JSON file.</p>
                    <button onClick={handleBackup} className="px-4 py-2 rounded-lg bg-sky-500 text-white hover:bg-sky-600 font-semibold shadow">Backup Now</button>
                </div>
                <div className="border-t my-4 dark:border-slate-600"></div>
                 <h3 className="font-bold text-lg text-red-600">Danger Zone</h3>
                <div className="flex items-center justify-between">
                    <p>Reset the application to its initial state. All data will be lost.</p>
                    <button onClick={handleReset} className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 font-semibold shadow">Reset App</button>
                </div>
            </div>
        </div>
    );
};

const SetupWizard: React.FC = () => {
    const { setSettings } = useAppContext();
    const [formData, setFormData] = useState({ companyName: 'Geetha Tex', numberOfMachines: 3 });

    const handleComplete = () => {
        if (formData.companyName && formData.numberOfMachines > 0) {
            setSettings(formData);
        }
    };
    
    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-brand-cream dark:bg-slate-900 p-4">
            <div className="w-full max-w-md bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-2xl text-center">
                <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-brand-teal to-brand-brown-dark mb-2">Welcome to Geetha Tex</h1>
                <p className="text-slate-500 dark:text-slate-400 mb-8">Let's get your dashboard set up.</p>

                <div className="space-y-4 text-left">
                    <div>
                        <label className="font-semibold text-brand-text dark:text-brand-text-dark">Company Name</label>
                        <input type="text" value={formData.companyName} onChange={e => setFormData({...formData, companyName: e.target.value})} className="w-full mt-1 p-3 border rounded-lg bg-slate-50 dark:bg-slate-700 dark:border-slate-600" />
                    </div>
                     <div>
                        <label className="font-semibold text-brand-text dark:text-brand-text-dark">Number of Machines</label>
                        <input type="number" min="1" value={formData.numberOfMachines} onChange={e => setFormData({...formData, numberOfMachines: Number(e.target.value)})} className="w-full mt-1 p-3 border rounded-lg bg-slate-50 dark:bg-slate-700 dark:border-slate-600" />
                    </div>
                </div>
                 <button onClick={handleComplete} className="w-full mt-8 py-3 rounded-lg bg-brand-teal text-white font-bold text-lg hover:bg-brand-teal-dark shadow-lg transition-transform hover:scale-105">
                    Complete Setup
                </button>
            </div>
        </div>
    );
};

// ==================================
//      MAIN APP COMPONENT
// ==================================

const AppContent: React.FC = () => {
    const { settings, batches, notification, deleteBatch } = useAppContext();
    const [currentPage, setCurrentPage] = useState<Page>('dashboard');
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isAddBatchModalOpen, setIsAddBatchModalOpen] = useState(false);
    const [addBatchForMachine, setAddBatchForMachine] = useState<number | undefined>(undefined);
    const [isEditBatchModalOpen, setIsEditBatchModalOpen] = useState(false);
    const [batchToEdit, setBatchToEdit] = useState<CalculatedBatch | null>(null);
    const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);


    const calculatedBatches = useMemo((): CalculatedBatch[] => {
        return batches.map(batch => {
            const ftotal = Math.round(batch.meterValue / 4);
            const average = ftotal > 0 ? parseFloat((batch.meterValue / ftotal).toFixed(2)) : 0;
            return { ...batch, ftotal, average };
        }).sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
    }, [batches]);
    
    const existingBatchNumbers = useMemo(() => batches.map(b => b.batchNumber), [batches]);

    const handleAddBatchClick = (machineNumber?: number) => {
        setAddBatchForMachine(machineNumber);
        setIsAddBatchModalOpen(true);
    };

    const handleEditBatch = (batch: CalculatedBatch) => {
        setBatchToEdit(batch);
        setIsEditBatchModalOpen(true);
    };

    const handleDeleteBatch = (batchId: string) => {
        if (window.confirm('Are you sure you want to delete this batch? This action cannot be undone.')) {
            deleteBatch(batchId);
        }
    };

    if (!settings) {
        return <SetupWizard />;
    }

    const renderPage = () => {
        switch (currentPage) {
            case 'dashboard': return <DashboardPage calculatedBatches={calculatedBatches} onNavigate={setCurrentPage} />;
            case 'machines': return <MachinesPage calculatedBatches={calculatedBatches} onEditBatch={handleEditBatch} onDeleteBatch={handleDeleteBatch} />;
            case 'userDetails': return <UserDetailsPage />;
            case 'settings': return <SettingsPage />;
            case 'reports': return <ReportsPage calculatedBatches={calculatedBatches} />;
            default: return <DashboardPage calculatedBatches={calculatedBatches} onNavigate={setCurrentPage} />;
        }
    };
    
    return (
        <div className="min-h-screen text-brand-text dark:text-brand-text-dark font-sans flex bg-brand-cream dark:bg-slate-900">
            {notification && <Notification message={notification} />}
            <AddBatchModal isOpen={isAddBatchModalOpen} onClose={() => setIsAddBatchModalOpen(false)} machineNumber={addBatchForMachine} />
            <EditBatchModal isOpen={isEditBatchModalOpen} onClose={() => setIsEditBatchModalOpen(false)} batchToEdit={batchToEdit} existingBatchNumbers={existingBatchNumbers} />
            <CalculatorModal isOpen={isCalculatorOpen} onClose={() => setIsCalculatorOpen(false)} />
            <Sidebar currentPage={currentPage} setCurrentPage={setCurrentPage} isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />
            <div className="flex-grow flex flex-col">
                <Header onSidebarToggle={() => setIsSidebarOpen(true)} />
                <main className="flex-grow p-4 sm:p-6 lg:p-8 w-full overflow-y-auto">
                    {renderPage()}
                </main>
            </div>
             <div className="fixed bottom-8 right-8 z-20 flex flex-col space-y-3">
                 <button onClick={() => setIsCalculatorOpen(true)} className="bg-slate-600 hover:bg-slate-700 text-white rounded-full p-4 shadow-xl transition-transform hover:scale-110" aria-label="Open Calculator">
                    <CalculatorIcon />
                </button>
                 {currentPage === 'dashboard' && (
                    <button onClick={() => handleAddBatchClick()} className="bg-brand-teal hover:bg-brand-teal-dark text-white rounded-full p-4 shadow-xl transition-transform hover:scale-110" aria-label="Add New Batch">
                        <PlusIcon />
                    </button>
                 )}
            </div>
        </div>
    );
};

const App: React.FC = () => (
    <AppProvider>
        <AppContent />
    </AppProvider>
);

export default App;
