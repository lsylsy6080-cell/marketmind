import "dotenv/config";

function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`환경변수 ${name}이 설정되지 않았습니다.`);
  }

  return value;
}

export const env = {
  supabaseUrl: getRequiredEnv("SUPABASE_URL"),
  supabaseSecretKey: getRequiredEnv("SUPABASE_SECRET_KEY"),
};