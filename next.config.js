/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    JWT_SECRET: process.env.JWT_SECRET,
    COMMAND_ORIGIN: process.env.COMMAND_ORIGIN,
  },
}
module.exports = nextConfig
