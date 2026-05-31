import { v4 as uuidv4 } from 'uuid';

const GUEST_ID_KEY = 'guest_id';
const GUEST_DATA_KEY = 'guest_data';

export interface GuestData {
  id: string;
  createdAt: number;
  lastActiveAt: number;
}

export const getGuestId = (): string => {
  let guestId = localStorage.getItem(GUEST_ID_KEY);
  if (!guestId) {
    guestId = 'guest_' + uuidv4();
    localStorage.setItem(GUEST_ID_KEY, guestId);
  }
  return guestId;
};

export const isGuest = (): boolean => {
  return !!localStorage.getItem(GUEST_ID_KEY) && !localStorage.getItem('auth_token');
};

export const updateGuestActivity = (): void => {
  const guestId = getGuestId();
  const data: GuestData = {
    id: guestId,
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
  };
  localStorage.setItem(GUEST_DATA_KEY, JSON.stringify(data));
};

export const getGuestData = (): GuestData | null => {
  const data = localStorage.getItem(GUEST_DATA_KEY);
  if (!data) return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
};

export const clearGuestData = (): void => {
  localStorage.removeItem(GUEST_ID_KEY);
  localStorage.removeItem(GUEST_DATA_KEY);
};

export const hasGuestData = (): boolean => {
  return !!localStorage.getItem(GUEST_ID_KEY);
};