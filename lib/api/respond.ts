import { NextResponse } from 'next/server'

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

function errorBody(message: string, details?: unknown) {
  return details !== undefined ? { error: message, details } : { error: message }
}

export function badRequest(message: string, details?: unknown) {
  return NextResponse.json(errorBody(message, details), { status: 400 })
}

export function unauthorized(message: string = 'Unauthorized') {
  return NextResponse.json({ error: message }, { status: 401 })
}

export function forbidden(message: string = 'Forbidden') {
  return NextResponse.json({ error: message }, { status: 403 })
}

export function notFound(message: string = 'Not found') {
  return NextResponse.json({ error: message }, { status: 404 })
}

export function gone(message: string = 'Gone') {
  return NextResponse.json({ error: message }, { status: 410 })
}

export function tooManyRequests(message: string = 'Too many requests') {
  return NextResponse.json({ error: message }, { status: 429 })
}

export function serverError(message: string = 'Internal server error') {
  return NextResponse.json({ error: message }, { status: 500 })
}

export function serviceUnavailable(message: string = 'Service unavailable', body?: Record<string, unknown>) {
  const payload = body ? { error: message, ...body } : { error: message }
  return NextResponse.json(payload, { status: 503 })
}
