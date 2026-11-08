const institutes = [
  { name: "ALLEN", image: "https://allen.in/favicon.ico", className: "logo-allen" },
  { name: "Aakash", image: "https://ik.imagekit.io/AESL123/main/images/AakashLogo.webp?tr=w-384,q-85,f-auto", className: "logo-aakash" },
  { name: "Physics Wallah", image: "https://www.pw.live/favicon.ico", className: "logo-pw" },
  { name: "Narayana", image: "https://narayanagroup.com/optimised-images/icons/logo.svg", className: "logo-narayana" },
  { name: "Sri Chaitanya", image: "https://srichaitanya.net/wp-content/uploads/2023/01/logo-1-1.jpg", className: "logo-chaitanya" },
  { name: "Resonance", image: "https://www.resonance.ac.in/menu/images/sml-logo.png", className: "logo-resonance" },
  { name: "Unacademy", image: "https://static.uacdn.net/production/_next/static/images/logo.svg", className: "logo-unacademy" },
  { name: "Vision IAS", image: "https://www.visionias.in/student/images/visionias_logo.png", className: "logo-vision" },
];

export default function InstituteLandscapeBanner() {
  return (
    <section className="tracky-institute-strip" aria-labelledby="institute-strip-heading">
      <div className="tracky-institute-strip-inner">
        <p id="institute-strip-heading" className="tracky-institute-strip-label">
          A snapshot of India&apos;s coaching landscape
        </p>
        <div className="tracky-institute-marquee" aria-label="Examples of established Indian coaching and test-preparation brands">
          <div className="tracky-institute-track">
            {[0, 1].map((copy) => (
              <div className="tracky-institute-group" key={copy} aria-hidden={copy === 1}>
                {institutes.map((institute) => (
                  <div className="tracky-institute-logo" key={institute.name}>
                    {/* These are first-party brand marks, kept as remote images to preserve their owners' artwork. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={institute.image} alt={copy === 0 ? institute.name : ""} loading="lazy" decoding="async" className={institute.className} />
                    <span>{institute.name}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
        <p className="tracky-institute-strip-caption">
          Independent examples only. These brands are not Tracky customers or partners; all marks belong to their respective owners.
        </p>
      </div>
    </section>
  );
}
