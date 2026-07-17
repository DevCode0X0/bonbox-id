export default function Brand({ href = "/", className = "" }: { href?: string; className?: string }) {
  return <a className={`brand ${className}`.trim()} href={href} aria-label="BONBOX beranda"><img className="brand-icon" src="/bonbox-icon.png" alt="" /><span>BON</span>BOX</a>;
}
