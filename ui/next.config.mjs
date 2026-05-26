/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    const api =
      process.env.NEXT_PUBLIC_TERRAVIEW_API || "http://localhost:7777";
    return [
      {
        source: "/api/:path*",
        destination: `${api.replace(/\/$/, "")}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
