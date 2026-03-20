export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-[#0C0C0F] text-[#E4E4E7] px-6 py-12">
      <div className="max-w-2xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold font-display mb-2">Política de Privacidade</h1>
          <p className="text-sm text-[#71717A]">Última atualização: 19 de março de 2026</p>
        </div>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">1. Sobre o TasksLudus</h2>
          <p className="text-sm text-[#A1A1AA] leading-relaxed">
            O TasksLudus é uma plataforma interna de gestão de conteúdo operada pela <strong className="text-[#E4E4E7]">Ludus</strong>,
            agência de marketing digital. O aplicativo é de <strong className="text-[#E4E4E7]">uso exclusivo</strong> dos
            clientes e colaboradores da Ludus, não sendo disponibilizado ao público em geral.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">2. Dados coletados</h2>
          <p className="text-sm text-[#A1A1AA] leading-relaxed">Ao conectar sua conta do Instagram Business ao TasksLudus, coletamos:</p>
          <ul className="text-sm text-[#A1A1AA] leading-relaxed list-disc pl-5 space-y-1">
            <li>Nome de usuário e ID da conta do Instagram</li>
            <li>Token de acesso (armazenado com criptografia AES-256-GCM)</li>
            <li>Métricas de publicações (impressões, alcance, engajamento)</li>
            <li>Conteúdo de mídia para publicação agendada</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">3. Uso dos dados</h2>
          <p className="text-sm text-[#A1A1AA] leading-relaxed">Os dados coletados são utilizados exclusivamente para:</p>
          <ul className="text-sm text-[#A1A1AA] leading-relaxed list-disc pl-5 space-y-1">
            <li>Publicar conteúdo no Instagram em nome do cliente, conforme autorizado</li>
            <li>Agendar publicações de imagens, vídeos, reels, stories e carrosséis</li>
            <li>Exibir métricas de desempenho das publicações</li>
            <li>Gerenciar o pipeline de produção de conteúdo</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">4. Compartilhamento de dados</h2>
          <p className="text-sm text-[#A1A1AA] leading-relaxed">
            Não compartilhamos, vendemos ou transferimos dados dos clientes a terceiros.
            Os dados são acessados exclusivamente pela equipe da Ludus para fins de gestão de conteúdo.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">5. Armazenamento e segurança</h2>
          <ul className="text-sm text-[#A1A1AA] leading-relaxed list-disc pl-5 space-y-1">
            <li>Tokens de acesso são criptografados com AES-256-GCM antes do armazenamento</li>
            <li>Dados são armazenados em servidores seguros (Railway/PostgreSQL)</li>
            <li>Acesso ao sistema protegido por autenticação JWT com controle de permissões</li>
            <li>Tokens do Instagram são renovados automaticamente e podem ser revogados a qualquer momento</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">6. Direitos do cliente</h2>
          <p className="text-sm text-[#A1A1AA] leading-relaxed">O cliente pode a qualquer momento:</p>
          <ul className="text-sm text-[#A1A1AA] leading-relaxed list-disc pl-5 space-y-1">
            <li>Desconectar sua conta do Instagram pelo painel do TasksLudus</li>
            <li>Revogar o acesso do aplicativo nas configurações do Instagram</li>
            <li>Solicitar a exclusão de todos os seus dados entrando em contato conosco</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">7. Exclusão de dados</h2>
          <p className="text-sm text-[#A1A1AA] leading-relaxed">
            Para solicitar a exclusão dos seus dados, entre em contato pelo e-mail abaixo.
            Ao desconectar o Instagram pelo painel, todos os tokens de acesso são imediatamente removidos do sistema.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">8. Contato</h2>
          <p className="text-sm text-[#A1A1AA] leading-relaxed">
            Para dúvidas sobre esta política ou sobre o uso dos seus dados:<br />
            <strong className="text-[#E4E4E7]">Ludus</strong> — <a href="mailto:pofazze@gmail.com" className="text-[#9A48EA] hover:underline">pofazze@gmail.com</a>
          </p>
        </section>

        <div className="border-t border-[#1E1E23] pt-6 text-center">
          <p className="text-xs text-[#52525B]">© 2026 Ludus. Todos os direitos reservados.</p>
        </div>
      </div>
    </div>
  );
}
