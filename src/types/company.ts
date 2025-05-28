export interface Company {
  id: string;
  name: string;
  description: string | null;
  website: string | null;
  logo: string | null;
  industry: string | null;
  size: '1-10' | '11-50' | '51-200' | '201-500' | '501-1000' | '1000+' | null;
  location: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CompanyMember {
  id: string;
  companyId: string;
  userId: string;
  role: string;
  joinedAt: Date;
  updatedAt: Date;
}

export interface CompanySettings {
  id: string;
  companyId: string;
  allowGuestUploads: boolean;
  maxFileSize: number;
  allowedFileTypes: string[];
  storageQuota: number;
  customBranding: {
    logo?: string;
    colors?: {
      primary?: string;
      secondary?: string;
    };
  } | null;
  notifications: {
    email?: boolean;
    push?: boolean;
    webhook?: string;
  } | null;
  security: {
    requireApproval: boolean;
    passwordProtected: boolean;
    expirationDays?: number;
  } | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CompanyInvite {
  id: string;
  companyId: string;
  email: string;
  role: string;
  token: string;
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
} 