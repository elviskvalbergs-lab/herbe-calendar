import { redirect } from 'next/navigation'

// Legacy setup page — per-account ERP connections are now configured in /admin/config
export default function SetupPage() {
  redirect('/admin/config')
}
