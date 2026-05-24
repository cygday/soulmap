export interface User {
  id: string;
  name: string;
  lat: number;
  lng: number;
  socketId?: string;
  photo?: string;
  interests?: string[];
  country?: string;
  friends?: string[];
}

export interface Message {
  fromUserId: string;
  text: string;
  timestamp: number;
  file?: {
    name: string;
    mime: string;
    data: string; // base64/data URL
  };
}
