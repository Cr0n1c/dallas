import { useState, useEffect } from 'react';
import { FiHome, FiCloud, FiMenu } from 'react-icons/fi';
import Cookies from 'js-cookie';

interface SidebarItem {
  icon: React.ReactNode;
  label: string;
  href: string;
}

const sidebarItems: SidebarItem[] = [
  { icon: <FiHome className="w-6 h-6" />, label: 'Infrastructure', href: '/infrastructure' },
  { icon: <FiCloud className="w-6 h-6" />, label: 'Kubernetes', href: '/kubernetes' },
];

interface HeaderProps {
  children: React.ReactNode;
}

export default function Header({ children }: HeaderProps) {
  // Sidebar state - always start with false (expanded) to match server
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [hasLoadedFromCookie, setHasLoadedFromCookie] = useState(false);

  useEffect(() => {
    // Load sidebar state from cookie after client-side hydration
    const savedState = Cookies.get('sidebarCollapsed');
    if (savedState === 'true') {
      setSidebarCollapsed(true);
    }
    setHasLoadedFromCookie(true);
    // Mark as initialized after a short delay to prevent initial animation
    const timer = setTimeout(() => {
      setIsInitialized(true);
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  const handleSidebarToggle = () => {
    const newState = !sidebarCollapsed;
    setSidebarCollapsed(newState);
    Cookies.set('sidebarCollapsed', newState.toString(), { expires: 365 });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-50 bg-white shadow-lg ${
          isInitialized && hasLoadedFromCookie ? 'transition-all duration-300 ease-in-out' : ''
        } ${sidebarCollapsed ? 'w-16' : 'w-64'}`}
      >
        <div className="flex items-center justify-between h-16 px-4 border-b border-gray-200">
          <h1 className="text-xl font-semibold text-gray-900">
            {sidebarCollapsed ? 'Dbg' : 'Debugger'}
          </h1>
        </div>
        <nav className="px-4 py-4">
          {sidebarItems.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className={`flex items-center px-4 py-2 text-gray-700 rounded-md hover:bg-primary-50 hover:text-primary-600 ${
                sidebarCollapsed ? 'justify-center' : ''
              }`}
              title={sidebarCollapsed ? item.label : undefined}
            >
              <div className="flex-shrink-0">
                {item.icon}
              </div>
              {!sidebarCollapsed && <span className="ml-3">{item.label}</span>}
            </a>
          ))}
        </nav>
      </div>

      {/* Main Content */}
      <div className={`${isInitialized && hasLoadedFromCookie ? 'transition-all duration-300' : ''} ${sidebarCollapsed ? 'ml-16' : 'ml-64'}`}>
        {/* Header */}
        <header className="bg-white shadow-sm">
          <div className="flex items-center justify-between h-16 px-4">
            <div className="flex items-center space-x-2">
              <button
                onClick={handleSidebarToggle}
                className="p-2 rounded-md hover:bg-gray-100"
              >
                <FiMenu className="w-6 h-6" />
              </button>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">Welcome, Admin</span>
            </div>
          </div>
        </header>

        {/* Dashboard Content */}
        <main className="p-6">
          <div className="w-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
