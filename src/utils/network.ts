/**
 * Convert an IP address to a numeric value
 */
export function ipToNumber(ip: string): number {
  const parts = ip.split('.').map(part => parseInt(part, 10));
  return (parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3];
}

/**
 * Check if an IP address is within a given CIDR range
 * @param ip The IP address to check (e.g., "192.168.1.1")
 * @param cidr The CIDR range (e.g., "192.168.1.0/24")
 */
export function isIPInCIDR(ip: string, cidr: string): boolean {
  const [range, bits = "32"] = cidr.split("/");
  const mask = ~(2 ** (32 - parseInt(bits, 10)) - 1);
  
  const ipNum = ipToNumber(ip);
  const rangeNum = ipToNumber(range);
  
  return (ipNum & mask) === (rangeNum & mask);
}

/**
 * Check if an IP address is within a given range
 * @param ip The IP address to check
 * @param range The IP range (CIDR or wildcard format)
 */
export function isIPInRange(ip: string, range: string): boolean {
  // Handle CIDR notation (e.g., "192.168.1.0/24")
  if (range.includes('/')) {
    return isIPInCIDR(ip, range);
  }
  
  // Handle wildcard notation (e.g., "192.168.1.*")
  if (range.includes('*')) {
    const ipParts = ip.split('.');
    const rangeParts = range.split('.');
    
    for (let i = 0; i < 4; i++) {
      if (rangeParts[i] === '*') {
        continue;
      }
      
      if (ipParts[i] !== rangeParts[i]) {
        return false;
      }
    }
    
    return true;
  }
  
  // Exact IP match
  return ip === range;
}

/**
 * Parse user agent string to get device, OS, and browser information
 */
export function parseUserAgent(userAgent: string): { 
  device: string; 
  os: string; 
  browser: string;
} {
  // This is a simplified version, in production you'd want to use a proper UA parser library
  let device = 'Unknown';
  let os = 'Unknown';
  let browser = 'Unknown';
  
  // Detect device
  if (userAgent.includes('Mobile')) {
    device = 'Mobile';
  } else if (userAgent.includes('Tablet')) {
    device = 'Tablet';
  } else {
    device = 'Desktop';
  }
  
  // Detect OS
  if (userAgent.includes('Windows')) {
    os = 'Windows';
  } else if (userAgent.includes('Mac OS')) {
    os = 'macOS';
  } else if (userAgent.includes('Linux')) {
    os = 'Linux';
  } else if (userAgent.includes('Android')) {
    os = 'Android';
  } else if (userAgent.includes('iOS') || userAgent.includes('iPhone') || userAgent.includes('iPad')) {
    os = 'iOS';
  }
  
  // Detect browser
  if (userAgent.includes('Chrome') && !userAgent.includes('Edg')) {
    browser = 'Chrome';
  } else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
    browser = 'Safari';
  } else if (userAgent.includes('Firefox')) {
    browser = 'Firefox';
  } else if (userAgent.includes('Edg')) {
    browser = 'Edge';
  } else if (userAgent.includes('MSIE') || userAgent.includes('Trident/')) {
    browser = 'Internet Explorer';
  }
  
  return { device, os, browser };
} 