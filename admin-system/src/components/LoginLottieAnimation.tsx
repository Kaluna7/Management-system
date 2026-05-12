import { useEffect, useRef } from "react";
import lottie from "lottie-web";
import adminAnimation from "../assets/animation/admin.json";

export function LoginLottieAnimation() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const anim = lottie.loadAnimation({
      container: el,
      renderer: "svg",
      loop: true,
      autoplay: true,
      animationData: adminAnimation as unknown as object,
      rendererSettings: {
        preserveAspectRatio: "xMidYMid meet",
      },
    });

    return () => {
      anim.destroy();
    };
  }, []);

  return (
    <div
      className="login-lottie"
      ref={containerRef}
      role="img"
      aria-label="Ilustrasi admin"
    />
  );
}
