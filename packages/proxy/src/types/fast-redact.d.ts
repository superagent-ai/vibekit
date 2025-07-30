declare module 'fast-redact' {
  interface RedactOptions {
    paths?: string[]
    censor?: string | ((value: any, path: string[]) => any)
    serialize?: boolean | ((obj: any) => string)
    remove?: boolean
    strict?: boolean
  }

  function fastRedact(options: RedactOptions): (obj: any) => any

  export = fastRedact
}