import { useState, useEffect, useCallback } from 'react';
import createDOMPurify from 'dompurify';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import Header from './header';
import { infrastructureLogger, logApiCall, logUserAction, logComponentEvent } from '../utils/logger';

// Initialize DOMPurify only in browser environment
const DOMPurify = typeof window !== 'undefined' ? createDOMPurify(window) : null;

// API configuration - use Next.js API routes instead of direct backend calls
const API_BASE_URL = '/api';





const commands = [
  { value: 'network', label: 'Network Connection Checker' },
  { value: 'curl', label: 'HTTP Request (cURL)' },
];

// RFC 3986 compliant hostname regex
const HOSTNAME_REGEX = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

// RFC 791 compliant IPv4 regex
const IPV4_REGEX = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

// RFC 3986 compliant URL regex
const URL_REGEX = /^(?:https?:\/\/)?[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

// Security constants
const MAX_COMMAND_LENGTH = 1000;
const MAX_HOST_LENGTH = 255;
const RATE_LIMIT_WINDOW = 60000; // 1 minute in milliseconds
const MAX_REQUESTS_PER_WINDOW = 10;

// Constants
const MAX_HISTORY_ITEMS = 10;
const HISTORY_STORAGE_KEY = 'command_history';

interface SecurityState {
  csrfToken: string;
  lastRequestTime: number;
  requestCount: number;
  blockedUntil: number | null;
}

interface CommandHistory {
  timestamp: number;
  command: string;
  input: string;
  output: string;
}

// Update API response interfaces
interface ApiResponse {
  output: string;
  error?: string;
}

interface HttpResponse {
  status_code: number;
  headers: Record<string, string>;
  body: string;
  error?: string;
}

export default function Infrastructure() {
  const [selectedCommand, setSelectedCommand] = useState('');
  const [commandOutput, setCommandOutput] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('');
  const [portError, setPortError] = useState('');
  const [hostError, setHostError] = useState('');
  const [securityState, setSecurityState] = useState<SecurityState>({
    csrfToken: uuidv4(),
    lastRequestTime: Date.now(),
    requestCount: 0,
    blockedUntil: null,
  });
  const [commandHistory, setCommandHistory] = useState<CommandHistory[]>([]);
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [httpMethod, setHttpMethod] = useState('GET');
  const [httpUrl, setHttpUrl] = useState('');
  const [httpHeaders, setHttpHeaders] = useState<Record<string, string>>({});
  const [httpError, setHttpError] = useState<string | null>(null);

  // Load command history from localStorage after component mounts
  useEffect(() => {
    logComponentEvent(infrastructureLogger, 'component_mounted');

    const savedHistory = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (savedHistory) {
      try {
        const parsedHistory = JSON.parse(savedHistory);
        setCommandHistory(parsedHistory);
        logComponentEvent(infrastructureLogger, 'command_history_loaded', {
          history_count: parsedHistory.length
        });
      } catch (e) {
        logComponentEvent(infrastructureLogger, 'command_history_load_failed', {
          error: e instanceof Error ? e.message : 'Unknown error'
        });
        console.error('Failed to parse command history from localStorage:', e);
      }
    } else {
      logComponentEvent(infrastructureLogger, 'no_command_history_found');
    }
  }, []);

  // Security utility functions
  const checkRateLimit = useCallback((): boolean => {
    const now = Date.now();
    const { lastRequestTime, requestCount, blockedUntil } = securityState;

    // Check if we're currently blocked
    if (blockedUntil && now < blockedUntil) {
      setIsRateLimited(true);
      return false;
    }

    // Reset count if window has passed
    if (now - lastRequestTime > RATE_LIMIT_WINDOW) {
      setSecurityState(prev => ({
        ...prev,
        lastRequestTime: now,
        requestCount: 1,
        blockedUntil: null,
      }));
      setIsRateLimited(false);
      return true;
    }

    // Check if we've exceeded the rate limit
    if (requestCount >= MAX_REQUESTS_PER_WINDOW) {
      const blockUntil = now + RATE_LIMIT_WINDOW;
      setSecurityState(prev => ({
        ...prev,
        blockedUntil: blockUntil,
      }));
      setIsRateLimited(true);
      return false;
    }

    // Increment request count
    setSecurityState(prev => ({
      ...prev,
      requestCount: prev.requestCount + 1,
    }));
    return true;
  }, [securityState]);

  const sanitizeOutput = (output: string): string => {
    // Truncate output if it exceeds maximum length
    if (output.length > MAX_COMMAND_LENGTH) {
      output = output.substring(0, MAX_COMMAND_LENGTH) + '... (truncated)';
    }

    // First, escape any HTML special characters while preserving newlines
    const escapedOutput = output
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
      // Additional security: escape control characters except newlines
      .replace(/[\x00-\x09\x0B-\x1F\x7F-\x9F]/g, '');

    // Then use DOMPurify as an additional security layer if available
    if (DOMPurify) {
      return DOMPurify.sanitize(escapedOutput);
    }

    return escapedOutput;
  };

  const validateHost = useCallback((value: string): boolean => {
    if (!value) {
      setHostError('');
      return false;
    }

    // Length validation
    if (value.length > MAX_HOST_LENGTH) {
      setHostError('Host name is too long');
      return false;
    }

    // Check for common injection patterns
    if (/[<>{}[\]\\]/.test(value)) {
      setHostError('Invalid characters in host name');
      return false;
    }

    // Check if it's a valid IPv4 address
    if (IPV4_REGEX.test(value)) {
      setHostError('');
      return true;
    }

    // Check if it's a valid hostname
    if (HOSTNAME_REGEX.test(value)) {
      setHostError('');
      return true;
    }

    // Check if it's a valid URL
    if (URL_REGEX.test(value)) {
      setHostError('');
      return true;
    }

    setHostError('Invalid host format. Must be a valid hostname, IPv4 address, or URL');
    return false;
  }, []);

  const validateInput = useCallback((input: string, type: 'host' | 'port'): boolean => {
    // Check for null bytes and other dangerous characters
    if (input.includes('\0') || /[\x00-\x1F\x7F-\x9F]/.test(input)) {
      return false;
    }

    // Type-specific validation
    switch (type) {
      case 'host':
        return validateHost(input);
      case 'port':
        const portNum = parseInt(input, 10);
        return !isNaN(portNum) && portNum >= 1 && portNum <= 65535 && Number.isInteger(portNum);
      default:
        return false;
    }
  }, [validateHost]);

  const addToCommandHistory = useCallback((command: string, input: string, output: string) => {
    const newHistory = [
      {
        timestamp: Date.now(),
        command,
        input,
        output,
      },
      ...commandHistory.slice(0, MAX_HISTORY_ITEMS - 1), // Keep only last N commands
    ];
    setCommandHistory(newHistory);

    logComponentEvent(infrastructureLogger, 'command_added_to_history', {
      command,
      input_length: input.length,
      output_length: output.length
    });

    // Save to localStorage
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(newHistory));
      logComponentEvent(infrastructureLogger, 'command_history_saved', {
        history_count: newHistory.length
      });
    } catch (e) {
      logComponentEvent(infrastructureLogger, 'command_history_save_failed', {
        error: e instanceof Error ? e.message : 'Unknown error'
      });
      console.error('Failed to save command history to localStorage:', e);
    }
  }, [commandHistory]);

  // Enhanced command execution with security measures
  const executeCommand = useCallback(async () => {
    const startTime = Date.now();
    logUserAction(infrastructureLogger, 'execute_command', { command: selectedCommand });

    // Check rate limit
    if (!checkRateLimit()) {
      logUserAction(infrastructureLogger, 'rate_limit_exceeded');
      setCommandOutput('Rate limit exceeded. Please try again later.');
      return;
    }

    // Validate CSRF token
    if (!securityState.csrfToken) {
      logUserAction(infrastructureLogger, 'csrf_validation_failed');
      setCommandOutput('Security validation failed. Please refresh the page.');
      return;
    }

    if (!selectedCommand) {
      logUserAction(infrastructureLogger, 'no_command_selected');
      setCommandOutput('Please select a command');
      return;
    }

    try {
      let response;

      if (selectedCommand === 'network') {
        if (!host || !port) {
          logUserAction(infrastructureLogger, 'missing_host_or_port', { host: !!host, port: !!port });
          setCommandOutput('Please provide both host and port');
          return;
        }

        if (!validateInput(host, 'host')) {
          logUserAction(infrastructureLogger, 'invalid_host', { host, error: hostError });
          setCommandOutput(`Invalid host: ${hostError}`);
          return;
        }

        if (!validateInput(port, 'port')) {
          logUserAction(infrastructureLogger, 'invalid_port', { port, error: portError });
          setCommandOutput(`Invalid port: ${portError}`);
          return;
        }

        logComponentEvent(infrastructureLogger, 'network_check_started', { host, port });

        response = await axios.post<ApiResponse>(`${API_BASE_URL}/network/check`, {
          host,
          port: parseInt(port, 10)
        });

        const output = response.data.error
          ? `Connection unsuccessful to ${host}:${port}\n\n${response.data.error}`
          : response.data.output;

        logApiCall(
          infrastructureLogger,
          'POST',
          `${API_BASE_URL}/network/check`,
          startTime,
          !response.data.error,
          response.status,
          response.data.error,
          { host, port: parseInt(port, 10) }
        );

        setCommandOutput(output);
        addToCommandHistory(selectedCommand, `${host}:${port}`, output);
      }
    } catch (error: unknown) {
      logApiCall(
        infrastructureLogger,
        'POST',
        `${API_BASE_URL}/network/check`,
        startTime,
        false,
        undefined,
        error instanceof Error ? error.message : 'Unknown error',
        { host, port: parseInt(port, 10) }
      );

      console.error('Command execution error:', error);
      const errorMessage = error instanceof Error ? error.message : 'An error occurred while executing the command. Please try again.';
      setCommandOutput(`Error: ${errorMessage}`);
    }
  }, [selectedCommand, host, port, hostError, portError, securityState.csrfToken, checkRateLimit, addToCommandHistory, validateInput]);

  const handleHttpRequest = async () => {
    const startTime = Date.now();
    logUserAction(infrastructureLogger, 'http_request', { method: httpMethod, url: httpUrl });

    try {
      setHttpError(null);
      const response = await axios.post<HttpResponse>(`${API_BASE_URL}/http/request`, {
        url: httpUrl,
        method: httpMethod,
        headers: httpHeaders,
      });

      const output = `HTTP ${response.data.status_code}\n\nHeaders:\n${Object.entries(response.data.headers)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n')}\n\nBody:\n${response.data.body}`;

      logApiCall(
        infrastructureLogger,
        'POST',
        `${API_BASE_URL}/http/request`,
        startTime,
        true,
        response.status,
        undefined,
        { method: httpMethod, url: httpUrl, status_code: response.data.status_code }
      );

      setCommandOutput(output);
      addToCommandHistory('curl', `${httpMethod} ${httpUrl}`, output);
    } catch (error) {
      logApiCall(
        infrastructureLogger,
        'POST',
        `${API_BASE_URL}/http/request`,
        startTime,
        false,
        undefined,
        error instanceof Error ? error.message : 'Unknown error',
        { method: httpMethod, url: httpUrl }
      );

      console.error('HTTP request error:', error);
      const errorMessage = error instanceof Error ? error.message : 'An error occurred while making the HTTP request';
      setHttpError(errorMessage);
      setCommandOutput(`Error: ${errorMessage}`);
    }
  };

  // Reset security state periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setSecurityState(prev => ({
        ...prev,
        requestCount: 0,
        blockedUntil: null,
      }));
      setIsRateLimited(false);
      logComponentEvent(infrastructureLogger, 'rate_limit_reset');
    }, RATE_LIMIT_WINDOW);

    return () => clearInterval(interval);
  }, []);

  const handleCommandChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const command = event.target.value;
    logUserAction(infrastructureLogger, 'command_changed', { command });

    setSelectedCommand(command);
    setHost(''); // Reset host when command changes
    setPort(''); // Reset port when command changes
    setPortError(''); // Reset port error
    setHostError(''); // Reset host error
    setHttpUrl(''); // Reset HTTP URL
    setHttpHeaders({}); // Reset HTTP headers

    setHttpError(null); // Reset HTTP error
  };

  const handleHostChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setHost(value);
    validateHost(value);
  };

  const handlePortChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setPort(value);

    // Validate port number
    if (value === '') {
      setPortError('');
      return;
    }

    const portNum = parseInt(value, 10);
    if (isNaN(portNum)) {
      setPortError('Port must be a number');
    } else if (portNum < 1 || portNum > 65535) {
      setPortError('Port must be between 1 and 65535');
    } else if (!Number.isInteger(portNum)) {
      setPortError('Port must be an integer');
    } else {
      setPortError('');
    }
  };

  return (
    <Header>
      <div className="space-y-6">
        {/* Infrastructure Tools Section */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Infrastructure Tools</h3>

          {/* Command Selection */}
          <div className="mb-6">
            <label htmlFor="command" className="block text-sm font-medium text-gray-700 mb-2">
              Select Command
            </label>
            <select
              id="command"
              value={selectedCommand}
              onChange={handleCommandChange}
              className="block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="">Select a command...</option>
              {commands.map((cmd) => (
                <option key={cmd.value} value={cmd.value}>
                  {cmd.label}
                </option>
              ))}
            </select>
          </div>

          {/* HTTP Request Inputs */}
          {selectedCommand === 'curl' && (
            <div className="mb-6">
              <div className="space-y-4">
                <div className="flex gap-4 items-end">
                  <div className="w-32">
                    <label htmlFor="httpMethod" className="block text-sm font-medium text-gray-700 mb-2">
                      Method
                    </label>
                    <select
                      id="httpMethod"
                      value={httpMethod}
                      onChange={(e) => setHttpMethod(e.target.value)}
                      className="block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    >
                      <option value="GET">GET</option>
                      <option value="HEAD">HEAD</option>
                      <option value="OPTIONS">OPTIONS</option>
                    </select>
                  </div>

                  <div className="flex-1">
                    <label htmlFor="httpUrl" className="block text-sm font-medium text-gray-700 mb-2">
                      URL
                    </label>
                    <input
                      type="text"
                      id="httpUrl"
                      value={httpUrl}
                      onChange={(e) => setHttpUrl(e.target.value)}
                      placeholder="Enter URL (e.g., https://api.example.com)"
                      className="block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    />
                  </div>

                  <div>
                    <button
                      onClick={handleHttpRequest}
                      className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
                    >
                      Send Request
                    </button>
                  </div>
                </div>

                {httpError && (
                  <div className="text-red-600 text-sm">
                    {httpError}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Network Checker Inputs */}
          {selectedCommand === 'network' && (
            <div className="mb-6">
              <div className="flex gap-4 items-start">
                <div className="flex-1">
                  <label htmlFor="host" className="block text-sm font-medium text-gray-700 mb-2">
                    Host
                  </label>
                  <input
                    type="text"
                    id="host"
                    value={host}
                    onChange={handleHostChange}
                    placeholder="Enter host (e.g., example.com, 192.168.1.1)"
                    className={`w-full px-3 py-2 bg-white border ${
                      hostError ? 'border-red-500' : 'border-gray-300'
                    } rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500`}
                  />
                  {hostError && (
                    <p className="mt-1 text-sm text-red-600">{hostError}</p>
                  )}
                </div>
                <div className="w-32">
                  <label htmlFor="port" className="block text-sm font-medium text-gray-700 mb-2">
                    Port
                  </label>
                  <input
                    type="number"
                    id="port"
                    value={port}
                    onChange={handlePortChange}
                    placeholder="1-65535"
                    min="1"
                    max="65535"
                    step="1"
                    className={`w-full px-3 py-2 bg-white border ${
                      portError ? 'border-red-500' : 'border-gray-300'
                    } rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500`}
                  />
                  {portError && (
                    <p className="mt-1 text-sm text-red-600">{portError}</p>
                  )}
                </div>
                <div className="pt-7">
                  <button
                    onClick={executeCommand}
                    disabled={!!portError || !!hostError}
                    className={`px-4 py-2 bg-primary-600 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 ${
                      (portError || hostError) ? 'opacity-50 cursor-not-allowed' : 'hover:bg-primary-700'
                    }`}
                  >
                    Check Connection
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Command Output and History Container */}
          <div className="flex gap-6">
            {/* Command Output with enhanced security */}
            <div className="w-[70%] bg-gray-50 rounded-lg p-4">
              <h4 className="text-md font-medium text-gray-900 mb-4">Command Output</h4>
              <pre className="bg-white p-4 rounded-md overflow-x-auto h-64 whitespace-pre-wrap border">
                <code
                  className="text-sm text-gray-800"
                  dangerouslySetInnerHTML={{ __html: sanitizeOutput(commandOutput || 'No command executed yet') }}
                />
              </pre>
              {isRateLimited && (
                <div className="mt-2 text-sm text-red-600">
                  Rate limit exceeded. Please wait before trying again.
                </div>
              )}
            </div>

            {/* Command History */}
            <div className="w-[30%] bg-gray-50 rounded-lg p-4">
              <h4 className="text-md font-medium text-gray-900 mb-4">Command History</h4>
              <div className="space-y-2 h-64 overflow-y-auto">
                {commandHistory.length > 0 ? (
                  commandHistory.map((entry, index) => (
                    <div key={index} className="text-sm text-gray-600 border-b border-gray-200 pb-2">
                      <div className="font-medium">
                        {new Date(entry.timestamp).toLocaleString()} - {entry.command}
                      </div>
                      <div className="ml-4">
                        Input: {sanitizeOutput(entry.input)}
                      </div>
                      <div className="ml-4">
                        Output: {sanitizeOutput(entry.output)}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-gray-500">No commands executed yet</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Header>
  );
}
