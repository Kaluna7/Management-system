export type LoginResponse = {
  token: string;
  user: {
    id: string;
    name: string;
    email?: string | null;
    role: string;
    departmentLabel?: string | null;
  };
};
