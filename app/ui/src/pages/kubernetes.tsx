import React, { useState, useEffect, useCallback, useMemo, useRef, Component, ReactNode, ErrorInfo } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, GridOptions, GridReadyEvent, ICellRendererParams, ValueFormatterParams, ModuleRegistry, AllCommunityModule } from 'ag-grid-community';
import { FaTrash, FaScroll } from 'react-icons/fa';
import Header from './header';
import { kubernetesLogger, logApiCall, logUserAction, logComponentEvent } from '../utils/logger';
import Cookies from 'js-cookie';

// Register AG Grid modules
ModuleRegistry.registerModules([AllCommunityModule]);

// Import AG Grid styles
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';

// Custom Multiselect Dropdown Component
interface MultiselectOption {
  value: string;
  label: string;
}

interface MultiselectProps {
  options: MultiselectOption[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder: string;
  label: string;
}

const MultiselectDropdown: React.FC<MultiselectProps> = ({ options, value, onChange, placeholder, label }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleOptionToggle = (optionValue: string) => {
    const newValue = value.includes(optionValue)
      ? value.filter(v => v !== optionValue)
      : [...value, optionValue];
    onChange(newValue);
  };

  const handleSelectAll = () => {
    onChange(options.map(opt => opt.value));
  };

  const handleClearAll = () => {
    onChange([]);
  };

  const selectedLabels = value.map(v => options.find(opt => opt.value === v)?.label || v);

  return (
    <div className="flex items-center space-x-2">
      <label className="text-sm font-medium text-gray-700">{label}:</label>
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="px-3 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white min-w-[200px] text-left flex justify-between items-center"
        >
          <span className={value.length === 0 ? 'text-gray-500' : 'text-gray-900'}>
            {value.length === 0
              ? placeholder
              : value.length === 1
                ? selectedLabels[0]
                : `${value.length} selected`
            }
          </span>
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {isOpen && (
          <div className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
            <div className="p-2 border-b border-gray-200">
              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="text-xs text-blue-600 hover:text-blue-800"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="text-xs text-red-600 hover:text-red-800"
                >
                  Clear All
                </button>
              </div>
            </div>
            <div className="py-1">
              {options.map((option) => (
                <label
                  key={option.value}
                  className="flex items-center px-3 py-2 hover:bg-gray-100 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={value.includes(option.value)}
                    onChange={() => handleOptionToggle(option.value)}
                    className="mr-2"
                  />
                  <span className="text-sm">{option.label}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Error Boundary Component
class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error?: Error }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Kubernetes component error:', error, errorInfo);
    // Log the error using our structured logger
    if (typeof window !== 'undefined') {
      // Import logger dynamically to avoid SSR issues
      import('../utils/logger').then(({ kubernetesLogger }) => {
        kubernetesLogger.error('Component error caught by ErrorBoundary', {
          error_message: error.message,
          error_stack: error.stack,
          component_stack: errorInfo.componentStack
        });
      }).catch(() => {
        // Fallback if logger import fails
        console.error('Failed to import logger for error logging');
      });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <Header>
          <div className="w-full p-6">
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
              <h3 className="text-lg font-medium text-red-800">Something went wrong</h3>
              <p className="mt-2 text-sm text-red-700">
                There was an error loading the Kubernetes page. Please refresh the page.
              </p>
              <button
                onClick={() => window.location.reload()}
                className="mt-4 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
              >
                Refresh Page
              </button>
            </div>
          </div>
        </Header>
      );
    }

    return this.props.children;
  }
}

// Register AG-Grid modules
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';

// Custom cell renderer for HTML content
const HtmlCellRenderer = (props: ICellRendererParams) => {
  return (
    <div
      className="w-full h-full flex items-center"
      dangerouslySetInnerHTML={{ __html: props.value || '' }}
    />
  );
};

// Custom cell renderer for timestamp
const TimestampRenderer = (props: ICellRendererParams) => {
  const timestamp = props.value;
  if (!timestamp) return <span className="text-gray-500">-</span>;

  try {
    const date = new Date(timestamp);
    const formattedDate = date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short'
    });

    return (
      <span className="text-gray-600 text-sm">
        {formattedDate}
      </span>
    );
  } catch {
    return <span className="text-red-500 text-sm">Invalid date</span>;
  }
};

// Custom cell renderer for status pill
const StatusPillRenderer = (props: ICellRendererParams) => {
  const phase = props.value;
  let color = 'bg-gray-200 text-gray-800';
  switch (phase) {
    case 'Running':
    case 'Succeeded':
      color = 'bg-green-100 text-green-800';
      break;
    case 'Pending':
      color = 'bg-yellow-100 text-yellow-800';
      break;
    case 'Failed':
      color = 'bg-red-100 text-red-800';
      break;
    default:
      color = 'bg-gray-200 text-gray-800';
  }
  return (
    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${color}`}>{phase}</span>
  );
};



// Custom cell renderer for actions (delete and scripts)
const ActionsRenderer = (props: ICellRendererParams) => {
  const podName = props.data.name;
  const namespace = props.data.namespace;
  const podPhase = props.data.phase;

  // Check if pod is in a deletable state
  const isDeletable = podPhase !== "Running" && podPhase !== "Succeeded";

  // Determine delete button styling based on deletable state
  const deleteButtonClass = isDeletable
    ? "text-red-600 hover:text-red-800 transition-colors duration-200 p-1 rounded-full hover:bg-red-50"
    : "text-gray-400 cursor-not-allowed p-1 rounded-full";

  const deleteButtonTitle = isDeletable
    ? "Delete Pod"
    : `Cannot delete pod in "${podPhase}" status. Only pods that are not Running or Succeeded can be deleted.`;

  return (
    <div className="h-full flex items-center justify-start pl-2 space-x-2">
      <button
        onClick={() => {
          // Access the handleScripts function from the component scope
          if (props.context?.onScripts) {
            props.context.onScripts(podName, namespace);
          }
        }}
        className="text-green-600 hover:text-green-800 transition-colors duration-200 p-1 rounded-full hover:bg-green-50"
        title="Scripts"
      >
        <FaScroll className="w-4 h-4" />
      </button>
      <button
        onClick={() => {
          // Only allow deletion if pod is in a deletable state
          if (isDeletable && props.context?.onDeletePod) {
            props.context.onDeletePod(podName, namespace);
          }
        }}
        className={deleteButtonClass}
        title={deleteButtonTitle}
        disabled={!isDeletable}
      >
        <FaTrash className="w-4 h-4" />
      </button>
    </div>
  );
};

interface PodInfo {
  id: string;
  name: string;
  namespace: string;
  created_timestamp: string;
  phase: string;
  healthy: boolean;
  ready: string;
  restart_count: number;
  image: string;
  node_name?: string;
  pod_ip?: string;
  host_ip?: string;
  app_name?: string;
}

interface PaginationInfo {
  page: number;
  page_size: number;
  total_items: number;
  total_pages: number;
  has_next: boolean;
  has_previous: boolean;
  max_limit_reached?: boolean;
}

interface KubernetesResponse {
  pods: PodInfo[];
  pagination?: PaginationInfo;
  error?: string;
  max_limit_reached?: boolean;
}

function KubernetesComponent() {
  const [pods, setPods] = useState<PodInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [podToDelete, setPodToDelete] = useState<{ name: string; namespace: string } | null>(null);
  const [showScriptsModal, setShowScriptsModal] = useState(false);
  const [podForScripts, setPodForScripts] = useState<{ name: string; namespace: string } | null>(null);
  const [selectedScript, setSelectedScript] = useState('dummy script');
  const [showSuccessAlert, setShowSuccessAlert] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [isMounted, setIsMounted] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [podsLoaded, setPodsLoaded] = useState(false);

  // Pagination state
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [namespaceFilter, setNamespaceFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [namespaces, setNamespaces] = useState<string[]>([]);
  const [namespacesLoading, setNamespacesLoading] = useState(true);

  const isStateRestoredRef = useRef(false);
  const fetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isFetchingRef = useRef(false);
  const filterTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cookie management for table state
  const COOKIE_NAME = 'kubernetes_table_state';
  const COOKIE_EXPIRES = 30;

  // Cookie management for query state
  const QUERY_COOKIE_NAME = 'kubernetes_query_state';
  const QUERY_COOKIE_EXPIRES = 30;

  const saveTableState = (state: Record<string, unknown>) => {
    try {
      const cookieValue = JSON.stringify(state);
      Cookies.set(COOKIE_NAME, cookieValue, { expires: COOKIE_EXPIRES });
      logComponentEvent(kubernetesLogger, 'table_state_saved', {
        state_keys: Object.keys(state)
      });
    } catch (error) {
      logComponentEvent(kubernetesLogger, 'table_state_save_failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      console.warn('Failed to save table state:', error);
    }
  };

  const loadTableState = () => {
    try {
      const cookieValue = Cookies.get(COOKIE_NAME);
      if (cookieValue) {
        const state = JSON.parse(cookieValue);
        logComponentEvent(kubernetesLogger, 'table_state_loaded', {
          state_keys: Object.keys(state)
        });
        return state;
      }
    } catch (error) {
      logComponentEvent(kubernetesLogger, 'table_state_load_failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      console.warn('Failed to load table state:', error);
    }
    return null;
  };

  // Save query state (filters, page size, current page)
  const saveQueryState = () => {
    try {
      const queryState = {
        namespaceFilter,
        statusFilter,
        pageSize,
        currentPage,
      };
      const cookieValue = JSON.stringify(queryState);
      Cookies.set(QUERY_COOKIE_NAME, cookieValue, { expires: QUERY_COOKIE_EXPIRES });
      logComponentEvent(kubernetesLogger, 'query_state_saved', {
        namespace_count: namespaceFilter.length,
        status_count: statusFilter.length,
        page_size: pageSize,
        current_page: currentPage
      });
    } catch (error) {
      logComponentEvent(kubernetesLogger, 'query_state_save_failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      console.warn('Failed to save query state:', error);
    }
  };

  // Load query state
  const loadQueryState = () => {
    try {
      const cookieValue = Cookies.get(QUERY_COOKIE_NAME);
      if (cookieValue) {
        const state = JSON.parse(cookieValue);
        logComponentEvent(kubernetesLogger, 'query_state_loaded', {
          state_keys: Object.keys(state)
        });
        return state;
      }
    } catch (error) {
      logComponentEvent(kubernetesLogger, 'query_state_load_failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      console.warn('Failed to load query state:', error);
    }
    return null;
  };


  // Handle scripts
  const handleScripts = (podName: string, namespace: string) => {
    logUserAction(kubernetesLogger, 'open_scripts_modal', { pod_name: podName, namespace });
    setPodForScripts({ name: podName, namespace });
    setShowScriptsModal(true);
  };

  // Handle delete pod
  const handleDeletePod = (podName: string, namespace: string) => {
    logUserAction(kubernetesLogger, 'open_delete_modal', { pod_name: podName, namespace });
    setPodToDelete({ name: podName, namespace });
    setShowDeleteModal(true);
  };

  // Confirm delete
  const confirmDelete = async () => {
    if (!podToDelete || isDeleting) return;

    setIsDeleting(true);
    const startTime = Date.now();
    logUserAction(kubernetesLogger, 'confirm_delete_pod', {
      pod_name: podToDelete.name,
      namespace: podToDelete.namespace
    });

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45000); // 45 second timeout

      const response = await fetch('/api/kubernetes/pods/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: podToDelete.name,
          namespace: podToDelete.namespace,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const successMessage = `Pod ${podToDelete.name}.${podToDelete.namespace}.pod.cluster.local was deleted successfully`;
        setSuccessMessage(successMessage);
        setShowSuccessAlert(true);

        logApiCall(
          kubernetesLogger,
          'POST',
          '/api/kubernetes/pods/delete',
          startTime,
          true,
          response.status,
          undefined,
          { pod_name: podToDelete.name, namespace: podToDelete.namespace }
        );

        // Refresh the pods list with a small delay to ensure deletion is processed
        setTimeout(() => {
          fetchPods();
        }, 1000);
        // Hide success alert after 5 seconds
        setTimeout(() => setShowSuccessAlert(false), 5000);
      } else {
        const errorData = await response.json();
        const errorMsg = `Failed to delete pod: ${errorData.error || 'Unknown error'}`;

        logApiCall(
          kubernetesLogger,
          'POST',
          '/api/kubernetes/pods/delete',
          startTime,
          false,
          response.status,
          errorMsg,
          { pod_name: podToDelete.name, namespace: podToDelete.namespace }
        );

        alert(errorMsg);
      }
    } catch (err) {
      let errorMsg = 'Error deleting pod';

      if (err instanceof Error) {
        if (err.name === 'AbortError') {
          errorMsg = 'Delete request timed out after 45 seconds';
        } else {
          errorMsg = `Error deleting pod: ${err.message}`;
        }
      }

      logApiCall(
        kubernetesLogger,
        'POST',
        '/api/kubernetes/pods/delete',
        startTime,
        false,
        undefined,
        errorMsg,
        { pod_name: podToDelete.name, namespace: podToDelete.namespace }
      );

      alert(errorMsg);
    } finally {
      setIsDeleting(false);
      setShowDeleteModal(false);
      setPodToDelete(null);
    }
  };

  // Cancel delete
  const cancelDelete = () => {
    logUserAction(kubernetesLogger, 'cancel_delete_pod');
    setShowDeleteModal(false);
    setPodToDelete(null);
  };

  // Apply script
  const applyScript = () => {
    if (!podForScripts) return;

    logUserAction(kubernetesLogger, 'apply_script', {
      pod_name: podForScripts.name,
      namespace: podForScripts.namespace,
      script: selectedScript
    });

    const successMessage = `Pod ${podForScripts.name}.${podForScripts.namespace}.pod.cluster.local is launching ${selectedScript}`;
    setSuccessMessage(successMessage);
    setShowSuccessAlert(true);
    setShowScriptsModal(false);
    setPodForScripts(null);
    setSelectedScript('dummy script');

    // Hide success alert after 5 seconds
    setTimeout(() => setShowSuccessAlert(false), 5000);
  };

  // Cancel scripts
  const cancelScripts = () => {
    logUserAction(kubernetesLogger, 'cancel_scripts');
    setShowScriptsModal(false);
    setPodForScripts(null);
    setSelectedScript('dummy script');
  };

  // Fetch pods data with debouncing and request tracking
  const fetchPods = async (page: number = currentPage, size: number = pageSize) => {
    // Prevent overlapping requests
    if (isFetchingRef.current) {
      logComponentEvent(kubernetesLogger, 'fetch_pods_skipped_overlapping');
      return;
    }

    // Clear any pending fetch timeout
    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current);
    }

    // Mark as fetching to prevent overlapping requests
    isFetchingRef.current = true;
    const startTime = Date.now();
    logComponentEvent(kubernetesLogger, 'fetch_pods_started');

    try {
      setLoading(true);
      setError(null);

      // Build query parameters
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: size.toString(),
      });

      if (namespaceFilter.length > 0) {
        params.append('namespaceFilter', namespaceFilter.join(','));
      }

      if (statusFilter.length > 0) {
        params.append('statusFilter', statusFilter.join(','));
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45000); // 45 seconds timeout

      const response = await fetch(`/api/kubernetes/pods?${params.toString()}`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: KubernetesResponse = await response.json();

      if (data.error) {
        setError(data.error);
        setPodsLoaded(false);
        logApiCall(
          kubernetesLogger,
          'GET',
          '/api/kubernetes/pods',
          startTime,
          false,
          response.status,
          data.error
        );
      } else {
        setPods(data.pods);

        // Update pagination with max limit reached flag
        if (data.pagination) {
          setPagination({
            ...data.pagination,
            max_limit_reached: data.max_limit_reached || false
          });
        } else {
          setPagination(null);
        }

        setPodsLoaded(true);
        logApiCall(
          kubernetesLogger,
          'GET',
          '/api/kubernetes/pods',
          startTime,
          true,
          response.status,
          undefined,
          {
            pod_count: data.pods.length,
            page: page,
            page_size: size,
            total_items: data.pagination?.total_items || 0
          }
        );
      }
    } catch (err) {
      let errorMsg = 'Failed to fetch pods';

      if (err instanceof Error) {
        if (err.name === 'AbortError') {
          errorMsg = 'Request timed out after 45 seconds';
        } else {
          errorMsg = err.message;
        }
      }

      setError(errorMsg);
      setPodsLoaded(false);

      logApiCall(
        kubernetesLogger,
        'GET',
        '/api/kubernetes/pods',
        startTime,
        false,
        undefined,
        errorMsg
      );
    } finally {
      setLoading(false);
      isFetchingRef.current = false; // Reset fetching flag
      logComponentEvent(kubernetesLogger, 'fetch_pods_completed');
    }
  };

  // Fetch namespaces
  const fetchNamespaces = async () => {
    try {
      setNamespacesLoading(true);
      const response = await fetch('/api/kubernetes/namespaces');

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      if (data.error) {
        console.error('Failed to fetch namespaces:', data.error);
        setNamespaces([]);
      } else {
        setNamespaces(data.namespaces || []);
      }
    } catch (error) {
      console.error('Error fetching namespaces:', error);
      setNamespaces([]);
    } finally {
      setNamespacesLoading(false);
    }
  };

  // Single useEffect to handle component mounting and data fetching
  useEffect(() => {
    setIsMounted(true);
    logComponentEvent(kubernetesLogger, 'component_mounted');

    // Load saved query state on component mount
    const savedQueryState = loadQueryState();
    if (savedQueryState) {
      setNamespaceFilter(savedQueryState.namespaceFilter || []);
      setStatusFilter(savedQueryState.statusFilter || []);
      setPageSize(savedQueryState.pageSize || 50);
      setCurrentPage(savedQueryState.currentPage || 1);
      logComponentEvent(kubernetesLogger, 'saved_query_state_restored', {
        namespace_count: savedQueryState.namespaceFilter?.length || 0,
        status_count: savedQueryState.statusFilter?.length || 0,
        page_size: savedQueryState.pageSize || 50,
        current_page: savedQueryState.currentPage || 1
      });
    }

    // Fetch namespaces on component mount
    fetchNamespaces();

    // Initial data fetch - use saved state if available, otherwise use defaults
    const initialPage = savedQueryState?.currentPage || 1;
    const initialPageSize = savedQueryState?.pageSize || 50;
    const initialNamespaceFilter = savedQueryState?.namespaceFilter || [];
    const initialStatusFilter = savedQueryState?.statusFilter || [];
    logComponentEvent(kubernetesLogger, 'component_ready');

    // Make initial API call with saved filters
    const initialParams = new URLSearchParams({
      page: initialPage.toString(),
      pageSize: initialPageSize.toString(),
    });

    if (initialNamespaceFilter.length > 0) {
      initialParams.append('namespaceFilter', initialNamespaceFilter.join(','));
    }

    if (initialStatusFilter.length > 0) {
      initialParams.append('statusFilter', initialStatusFilter.join(','));
    }

    // Make the initial request directly to avoid state conflicts
    setLoading(true);
    fetch(`/api/kubernetes/pods?${initialParams.toString()}`)
      .then(response => response.json())
      .then(data => {
        if (data.error) {
          setError(data.error);
          setPodsLoaded(false);
        } else {
          setPods(data.pods);
          if (data.pagination) {
            setPagination({
              ...data.pagination,
              max_limit_reached: data.max_limit_reached || false
            });
          } else {
            setPagination(null);
          }
          setPodsLoaded(true);
        }
      })
      .catch(error => {
        console.error('Initial fetch failed:', error);
        setError('Failed to fetch initial data');
        setPodsLoaded(false);
      })
      .finally(() => {
        setLoading(false);
      });

    // Refresh data every 60 seconds with cache warming
    const interval = setInterval(() => {
      logComponentEvent(kubernetesLogger, 'auto_refresh_triggered');
      fetchPods();
    }, 60000);

    // Cache warming: make a request 5 seconds before the next refresh
    const cacheWarmingInterval = setInterval(() => {
      logComponentEvent(kubernetesLogger, 'cache_warming_triggered');
      // Make a silent request to warm the cache with current pagination params
      const params = new URLSearchParams({
        page: currentPage.toString(),
        pageSize: pageSize.toString(),
      });
      if (namespaceFilter.length > 0) params.append('namespaceFilter', namespaceFilter.join(','));
      if (statusFilter.length > 0) params.append('statusFilter', statusFilter.join(','));

      fetch(`/api/kubernetes/pods?${params.toString()}`).catch(() => {
        // Ignore errors for cache warming
      });
    }, 55000); // 5 seconds before the main refresh

    logComponentEvent(kubernetesLogger, 'auto_refresh_interval_set', { interval_ms: 60000 });

    return () => {
      clearInterval(interval);
      clearInterval(cacheWarmingInterval);
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current);
      }
      isFetchingRef.current = false; // Reset fetching flag on cleanup
      logComponentEvent(kubernetesLogger, 'auto_refresh_interval_cleared');
    };
  }, []); // Only run on mount

  // Effect to handle data fetching when query parameters change
  useEffect(() => {
    // Skip the initial fetch since it's handled in the mount effect
    if (isMounted) {
      fetchPods();
    }
  }, [currentPage, pageSize, namespaceFilter, statusFilter]);

  // Debounced filter effect
  useEffect(() => {
    if (filterTimeoutRef.current) {
      clearTimeout(filterTimeoutRef.current);
    }

    filterTimeoutRef.current = setTimeout(() => {
      setCurrentPage(1); // Reset to first page when filters change
      fetchPods(1, pageSize);
    }, 500); // 500ms debounce

    return () => {
      if (filterTimeoutRef.current) {
        clearTimeout(filterTimeoutRef.current);
      }
    };
  }, [namespaceFilter, statusFilter]);

  // Save query state whenever it changes
  useEffect(() => {
    saveQueryState();
  }, [namespaceFilter, statusFilter, pageSize, currentPage]);

  // Column definitions
  const columnDefs = useMemo<ColDef[]>(() => [
    {
      field: 'actions',
      headerName: 'Actions',
      sortable: false,
      filter: false,
      resizable: true,
      width: 120,
      cellRenderer: ActionsRenderer,
    },
    {
      field: 'name',
      headerName: 'Pod Name',
      sortable: true,
      filter: false,
      resizable: true,
      width: 350,
      minWidth: 200,
    },
    {
      field: 'namespace',
      headerName: 'Namespace',
      sortable: true,
      filter: false,
      resizable: true,
      minWidth: 120,
    },
    {
      field: 'phase',
      headerName: 'Status',
      sortable: true,
      filter: false,
      resizable: true,
      minWidth: 150,
      cellRenderer: StatusPillRenderer,
    },
    {
      field: 'restart_count',
      headerName: 'Restarts',
      sortable: true,
      filter: false,
      resizable: true,
      width: 100,
      cellRenderer: (params: ICellRendererParams) => {
        const count = params.value;
        if (count > 0) {
          return <span className="text-red-600 font-bold">{count}</span>;
        }
        return <span className="text-green-600">{count}</span>;
      },
    },
    {
      field: 'image',
      headerName: 'Image',
      sortable: true,
      filter: false,
      resizable: true,
      width: 250,
      valueFormatter: (params: ValueFormatterParams) => {
        const image = params.value;
        return `<span class=\"text-gray-700 font-mono text-sm\">${image}</span>`;
      },
      cellRenderer: HtmlCellRenderer,
    },
    {
      field: 'node_name',
      headerName: 'Node',
      sortable: true,
      filter: false,
      resizable: true,
      width: 150,
    },
    {
      field: 'pod_ip',
      headerName: 'Pod IP',
      sortable: true,
      filter: false,
      resizable: true,
      width: 120,
      valueFormatter: (params: ValueFormatterParams) => {
        const ip = params.value;
        return ip ? `<span class=\"text-gray-700 font-mono text-sm\">${ip}</span>` : '-';
      },
      cellRenderer: HtmlCellRenderer,
    },
    {
      field: 'app_name',
      headerName: 'App Name',
      sortable: true,
      filter: false,
      resizable: true,
      minWidth: 120,
      valueFormatter: (params: ValueFormatterParams) => {
        const appName = params.value;
        return appName || '-';
      },
      cellRenderer: HtmlCellRenderer,
    },
    {
      field: 'created_timestamp',
      headerName: 'Created',
      sortable: true,
      filter: false,
      resizable: true,
      minWidth: 300,
      cellRenderer: TimestampRenderer,
    },
  ], []);

  // Grid options
  const gridOptions: GridOptions = useMemo(() => ({

    // Row ID callback
    getRowId: (params) => params.data.id,

    // Default column properties
    defaultColDef: {
      sortable: true,
      filter: false,
      resizable: true,
      minWidth: 100,
    },

    // Row selection
    rowSelection: 'single',

    // Disable client-side pagination since we're using server-side pagination
    pagination: false,

    // Enable tooltips
    tooltipShowDelay: 0,
    tooltipHideDelay: 2000,

    // Enable animations
    animateRows: true,

    // Use legacy theme to avoid conflicts with CSS imports
    theme: 'legacy',

    // Context for actions functionality
    context: {
      onDeletePod: handleDeletePod,
      onScripts: handleScripts,
    },

    // State persistence - save state on any grid change
    onModelUpdated: (event) => {
      try {
        const state = {
          columnState: event.api.getColumnState(),
        };
        saveTableState(state);
        logComponentEvent(kubernetesLogger, 'grid_model_updated', {
          row_count: event.api.getDisplayedRowCount()
        });
      } catch (error) {
        logComponentEvent(kubernetesLogger, 'grid_model_update_failed', {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        console.warn('Failed to save table state:', error);
      }
    },

    // Additional event handlers for better state capture
    onColumnMoved: (event) => {
      try {
        const state = {
          columnState: event.api.getColumnState(),
        };
        saveTableState(state);
        logComponentEvent(kubernetesLogger, 'grid_column_moved', {
          column: event.column?.getColId() || 'unknown'
        });
      } catch (error) {
        logComponentEvent(kubernetesLogger, 'grid_column_move_failed', {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        console.warn('Failed to save table state after column move:', error);
      }
    },

    onColumnResized: (event) => {
      try {
        const state = {
          columnState: event.api.getColumnState(),
        };
        saveTableState(state);
        logComponentEvent(kubernetesLogger, 'grid_column_resized', {
          column: event.column?.getColId() || 'unknown',
          new_width: event.column?.getActualWidth() || 0
        });
      } catch (error) {
        logComponentEvent(kubernetesLogger, 'grid_column_resize_failed', {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        console.warn('Failed to save table state after column resize:', error);
      }
    },
  }), []);

  const onGridReady = useCallback((params: GridReadyEvent) => {
    logComponentEvent(kubernetesLogger, 'grid_ready');

    // Restore saved state immediately before any other operations
    const savedState = loadTableState();
    if (savedState) {
      try {
        if (savedState.columnState && savedState.columnState.length > 0) {
          params.api.applyColumnState({
            state: savedState.columnState,
            applyOrder: true,
          });
          logComponentEvent(kubernetesLogger, 'grid_state_restored', {
            column_state_count: savedState.columnState.length
          });
        }


      } catch (error) {
        logComponentEvent(kubernetesLogger, 'grid_state_restore_failed', {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        console.warn('Failed to restore table state:', error);
      }
    } else {
      logComponentEvent(kubernetesLogger, 'grid_no_saved_state');
    }

    // Enable state saving after restoration is complete
    isStateRestoredRef.current = true;
    logComponentEvent(kubernetesLogger, 'grid_state_saving_enabled');

    // Size columns to fit after state restoration
    params.api.sizeColumnsToFit();
    logComponentEvent(kubernetesLogger, 'grid_initialization_complete');
  }, []);

  return (
    <Header>
      <div className="w-full">
        {/* Loading Alert */}
        {!podsLoaded && (
          <div className="fixed inset-0 flex items-center justify-center z-50">
            <div className="px-6 py-4 rounded shadow-lg bg-blue-100 border border-blue-400 text-blue-700">
              <div className="flex items-center">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 mr-2"></div>
                <span className="font-medium">Loading cluster pods...</span>
              </div>
              <div className="mt-2 text-xs text-blue-600">
                {loading ? 'Fetching data from Kubernetes API...' : 'Initializing...'}
              </div>
            </div>
          </div>
        )}

        {/* Success Alert */}
        {showSuccessAlert && (
          <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50">
            <div className={`px-4 py-3 rounded shadow-lg ${
              successMessage.includes('launching') || successMessage.includes('deleted successfully')
                ? 'bg-green-100 border border-green-400 text-green-700'
                : 'bg-red-100 border border-red-400 text-red-700'
            }`}>
              <div className="flex items-center">
                <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="font-medium">{successMessage}</span>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteModal && podToDelete && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
              <div className="flex items-center mb-4">
                <div className="flex-shrink-0">
                  <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-lg font-medium text-gray-900">Delete Pod</h3>
                </div>
              </div>
              <div className="mb-6">
                <p className="text-sm text-gray-500">
                  Are you sure you want to delete{' '}
                  <span className="font-mono text-gray-900">
                    {podToDelete.name}.{podToDelete.namespace}.pod.cluster.local
                  </span>
                  ?
                </p>
                <p className="text-xs text-red-600 mt-2">This action cannot be undone.</p>
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  onClick={cancelDelete}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  disabled={isDeleting}
                  className={`px-4 py-2 text-sm font-medium text-white border border-transparent rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 ${
                    isDeleting
                      ? 'bg-red-400 cursor-not-allowed'
                      : 'bg-red-600 hover:bg-red-700'
                  }`}
                >
                  {isDeleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Scripts Modal */}
        {showScriptsModal && podForScripts && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
              <div className="flex items-center mb-4">
                <div className="flex-shrink-0">
                  <FaScroll className="h-6 w-6 text-green-600" />
                </div>
                <div className="ml-3">
                  <h3 className="text-lg font-medium text-gray-900">Run Script</h3>
                </div>
              </div>
              <div className="mb-6">
                <p className="text-sm text-gray-500 mb-4">
                  Select a script to run on{' '}
                  <span className="font-mono text-gray-900">
                    {podForScripts.name}.{podForScripts.namespace}.pod.cluster.local
                  </span>
                </p>
                <div>
                  <label htmlFor="script-select" className="block text-sm font-medium text-gray-700 mb-2">
                    Script
                  </label>
                  <select
                    id="script-select"
                    value={selectedScript}
                    onChange={(e) => setSelectedScript(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  >
                    <option value="dummy script">dummy script</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  onClick={cancelScripts}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500"
                >
                  Cancel
                </button>
                <button
                  onClick={applyScript}
                  className="px-4 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Max Limit Alert */}
        {pagination?.max_limit_reached && (
          <div className="mb-4 mx-6 p-4 bg-red-50 border border-red-200 rounded-md">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Max Limit Reached</h3>
                <div className="mt-2 text-sm text-red-700">
                  Max Limit of <b>1000</b> pods returned. Only showing a subset of pods.<br/>
                  <span className="font-semibold">Warning:</span> Large queries (1000+ pods) can significantly slow down query time.<br/>
                  Please update your search terms to be more granular if you want all results and faster response times.
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-between items-center mb-6 px-6">
          <h3 className="text-lg font-medium text-gray-900">Kubernetes Pod Status</h3>
          <div className="flex items-center space-x-4">
            <button
              onClick={() => fetchPods()}
              className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Refresh
            </button>
            {loading && (
              <div className="flex items-center text-blue-600">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
                Loading...
              </div>
            )}
            <div className="text-sm text-gray-500">
              {pagination ?
                (pagination.max_limit_reached ?
                  `1000+ pods found (showing first ${pagination.total_items})` :
                  `${pagination.total_items} pods found`
                ) :
                `${pods.length} pods found`
              }
            </div>
          </div>
        </div>

        {/* Filters and Pagination Controls */}
        <div className="mb-4 px-6">
          <div className="flex flex-wrap items-center gap-4 mb-4">
            {/* Namespace Filter */}
            <MultiselectDropdown
              options={namespaces.map(ns => ({ value: ns, label: ns }))}
              value={namespaceFilter}
              onChange={setNamespaceFilter}
              placeholder={namespacesLoading ? "Loading namespaces..." : "Select namespaces"}
              label="Namespace"
            />

            {/* Status Filter */}
            <MultiselectDropdown
              options={[
                { value: 'Running', label: 'Running' },
                { value: 'Pending', label: 'Pending' },
                { value: 'Succeeded', label: 'Succeeded' },
                { value: 'Failed', label: 'Failed' },
                { value: 'Unknown', label: 'Unknown' },
              ]}
              value={statusFilter}
              onChange={setStatusFilter}
              placeholder="Select statuses"
              label="Status"
            />

            {/* Page Size */}
            <div className="flex items-center space-x-2">
              <label className="text-sm font-medium text-gray-700">Page size:</label>
              <select
                value={pageSize}
                onChange={(e) => {
                  const newSize = parseInt(e.target.value);
                  setPageSize(newSize);
                  setCurrentPage(1);
                  // Removed direct call to fetchPods here; useEffect will handle it
                }}
                className="px-3 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
                <option value={500}>500</option>
                <option value={1000}>1000</option>
              </select>
            </div>


          </div>

          {/* Pagination Controls */}
          {pagination && (
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600">
                Showing {((pagination.page - 1) * pagination.page_size) + 1} to{' '}
                {Math.min(pagination.page * pagination.page_size, pagination.total_items)} of{' '}
                {pagination.total_items} pods
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => {
                    if (pagination.has_previous) {
                      const newPage = currentPage - 1;
                      setCurrentPage(newPage);
                      fetchPods(newPage, pageSize);
                    }
                  }}
                  disabled={!pagination.has_previous}
                  className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <span className="text-sm text-gray-600">
                  Page {pagination.page} of {pagination.total_pages}
                </span>
                <button
                  onClick={() => {
                    if (pagination.has_next) {
                      const newPage = currentPage + 1;
                      setCurrentPage(newPage);
                      fetchPods(newPage, pageSize);
                    }
                  }}
                  disabled={!pagination.has_next}
                  className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="mb-4 mx-6 p-4 bg-red-50 border border-red-200 rounded-md">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Error loading pods</h3>
                <div className="mt-2 text-sm text-red-700">{error}</div>
              </div>
            </div>
          </div>
        )}

        {isMounted ? (
          <div
            className="ag-theme-alpine w-full"
            style={{
              height: '600px',
              '--ag-background-color': '#f8fafc',
              '--ag-header-background-color': '#e2e8f0',
              '--ag-odd-row-background-color': '#f1f5f9',
              '--ag-row-hover-color': '#e0e7ff',
              '--ag-selected-row-background-color': '#dbeafe',
              '--ag-font-family': 'Inter, system-ui, sans-serif',
              '--ag-font-size': '14px',
              '--ag-header-height': '48px',
              '--ag-row-height': '48px',
            } as React.CSSProperties}
          >
            <AgGridReact
              columnDefs={columnDefs}
              rowData={pods}
              gridOptions={gridOptions}
              onGridReady={onGridReady}
            />
          </div>
        ) : (
          <div className="flex items-center justify-center h-96">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        )}
      </div>
    </Header>
  );
}

export default function Kubernetes() {
  return (
    <ErrorBoundary>
      <KubernetesComponent />
    </ErrorBoundary>
  );
}
