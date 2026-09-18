import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import MobileBottomNav from './components/MobileBottomNav';
import Toast from './components/Toast';
import InvoiceModal from './components/InvoiceModal';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import POS from './pages/POS';
import Products from './pages/Products';
import Batches from './pages/Batches';
import Inventory from './pages/Inventory';
import Purchases from './pages/Purchases';
import Suppliers from './pages/Suppliers';
import Customers from './pages/Customers';
import UdharManagement from './pages/UdharManagement';
import SmsReminder from './pages/SmsReminder';
import SalesReturns from './pages/SalesReturns';
import PurchaseReturns from './pages/PurchaseReturns';
import Expenses from './pages/Expenses';
import Reports from './pages/Reports';
import UsersPermissions from './pages/UsersPermissions';
import BusinessSettings from './pages/BusinessSettings';
import AuditLogs from './pages/AuditLogs';

import { apiRequest, getAuthToken, setAuthToken } from './api';

export default function App() {
  const [user, setUser] = useState(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [printableInvoice, setPrintableInvoice] = useState(null);

  const showToast = (message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    checkCurrentSession();
  }, []);

  const checkCurrentSession = async () => {
    const token = getAuthToken();
    if (!token) {
      setAuthChecking(false);
      return;
    }

    try {
      const res = await apiRequest('/auth/me');
      if (res.success) {
        setUser(res.user);
      } else {
        setAuthToken(null);
      }
    } catch (err) {
      setAuthToken(null);
    } finally {
      setAuthChecking(false);
    }
  };

  const handleLogout = () => {
    setAuthToken(null);
    setUser(null);
    showToast('Logged out of system', 'info');
  };

  if (authChecking) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white font-semibold">
        Verifying Session Credentials...
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <Login onLoginSuccess={setUser} showToast={showToast} />
        <Toast toast={toast} onClose={() => setToast(null)} />
      </>
    );
  }

  // Render Page module based on active tab
  const renderTabContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard onNavigate={setActiveTab} showToast={showToast} />;
      case 'pos':
        return <POS showToast={showToast} onSaleComplete={setPrintableInvoice} />;
      case 'products':
        return <Products showToast={showToast} />;
      case 'batches':
        return <Batches showToast={showToast} />;
      case 'inventory':
        return <Inventory showToast={showToast} />;
      case 'purchases':
        return <Purchases showToast={showToast} />;
      case 'suppliers':
        return <Suppliers showToast={showToast} />;
      case 'customers':
        return <Customers showToast={showToast} />;
      case 'udhar':
        return <UdharManagement onNavigate={setActiveTab} showToast={showToast} />;
      case 'sms':
        return <SmsReminder showToast={showToast} />;
      case 'sales_returns':
        return <SalesReturns showToast={showToast} />;
      case 'purchase_returns':
        return <PurchaseReturns showToast={showToast} />;
      case 'expenses':
        return <Expenses showToast={showToast} />;
      case 'reports':
        return <Reports showToast={showToast} />;
      case 'users':
        return <UsersPermissions showToast={showToast} user={user} />;
      case 'settings':
        return <BusinessSettings showToast={showToast} />;
      case 'audit':
        return <AuditLogs showToast={showToast} />;
      default:
        return <Dashboard onNavigate={setActiveTab} showToast={showToast} />;
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-100 font-sans">
      <Navbar
        user={user}
        onNavigate={setActiveTab}
        onLogout={handleLogout}
        onToggleSidebar={() => setIsSidebarOpen(prev => !prev)}
      />

      <div className="flex-1 flex overflow-hidden relative">
        <Sidebar
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          userPermissions={user.permissions || []}
          user={user}
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
        />
        <main className="flex-1 overflow-y-auto pb-16 lg:pb-0">
          {renderTabContent()}
        </main>
      </div>

      {/* Native-like Mobile Bottom Navigation */}
      <MobileBottomNav
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenMenu={() => setIsSidebarOpen(true)}
      />

      {/* Global Toast */}
      <Toast toast={toast} onClose={() => setToast(null)} />

      {/* Printable Invoice Modal */}
      {printableInvoice && (
        <InvoiceModal
          invoiceData={printableInvoice}
          onClose={() => setPrintableInvoice(null)}
        />
      )}
    </div>
  );
}
