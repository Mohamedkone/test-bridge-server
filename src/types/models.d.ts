// src/types/models.d.ts

export interface User {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    auth0Id: string | null;
    picture?: string;
    profilePicture?:string | null;
    emailVerified?: data.emailVerified | false;
    isActive: data.isActive ;
    userType: 'b2c' | 'b2b';
    createdAt: Date;
    updatedAt: Date;
  }