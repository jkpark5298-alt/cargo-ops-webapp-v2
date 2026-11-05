/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: true
  },
  async redirects() {
    // 예전 주소(/fixed-lite)로 저장한 즐겨찾기·홈 화면 바로가기가 계속 열리도록 연결
    return [{ source: "/fixed-lite", destination: "/afocs-skd", permanent: false }];
  }
};

export default nextConfig;
