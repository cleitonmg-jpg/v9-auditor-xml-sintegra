export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-2">
        <h1 className="text-4xl font-bold text-muted-foreground">404</h1>
        <p className="text-muted-foreground">Página não encontrada.</p>
        <a href="/" className="text-primary text-sm hover:underline">Voltar ao início</a>
      </div>
    </div>
  );
}
