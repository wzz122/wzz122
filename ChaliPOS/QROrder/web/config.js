// 扫码点单页面的连接设置。部署时只需要改这个文件。
// supabaseUrl / anonKey：Supabase 项目的 Project URL 和 anon（或 publishable）key（可以公开，权限只到 chali_* 函数）
// defaultStore：二维码里没有 ?s= 时使用的门店 ID
window.CHALI_CONFIG = {
  supabaseUrl: "https://YOUR-PROJECT.supabase.co",
  anonKey: "YOUR-ANON-KEY",
  defaultStore: "chalichali-01",
};
