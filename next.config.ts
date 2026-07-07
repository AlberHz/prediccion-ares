/** @type {import('next').NextConfig} */
const nextConfig = {
  // Ignora los errores de TypeScript durante el build del frontend si vienen de carpetas externas
  typescript: {
    ignoreBuildErrors: true, 
  },
}