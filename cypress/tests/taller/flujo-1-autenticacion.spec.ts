describe("Flujo 1: Autenticación y Control de Acceso", () => {
  const backendUrl = "http://localhost:3001";

  beforeEach(() => {
    cy.task("db:seed");
    cy.viewport(1280, 720);
  });

  it("TC-AUTH-001 (Caja Negra - Positivo): Inicio de sesión exitoso con credenciales válidas y recordatorio", () => {
    cy.visit("/signin");

    cy.getBySel("signin-username").type("Katharina_Bernier");
    cy.getBySel("signin-password").type("s3cret");
    cy.getBySel("signin-remember-me").find("input").check();
    cy.getBySel("signin-submit").click();

    cy.location("pathname", { timeout: 10000 }).should("equal", "/");
    cy.getBySel("sidenav-user-balance").should("be.visible");
    cy.getBySel("sidenav-username").should("contain", "Katharina_Bernier");

    cy.screenshot("evidencias/flujo-1-autenticacion/TC-AUTH-001");
  });

  it("TC-AUTH-002 (Caja Negra - Negativo): Intento de inicio de sesión con contraseña incorrecta", () => {
    cy.visit("/signin");

    cy.getBySel("signin-username").type("Katharina_Bernier");
    cy.getBySel("signin-password").type("PasswordErroneo123*");
    cy.getBySel("signin-submit").click();

    cy.getBySel("signin-error")
      .should("be.visible")
      .and(($el) => {
        const text = $el.text();
        expect(text).to.match(/Username or password (is invalid|does not match)/i);
      });

    cy.location("pathname").should("equal", "/signin");

    cy.screenshot("evidencias/flujo-1-autenticacion/TC-AUTH-002");
  });

  it("TC-AUTH-003 (Caja Negra - Negativo): Acceso denegado a ruta protegida sin autenticación", () => {
    cy.clearCookies();
    cy.clearLocalStorage();

    cy.visit("/bankaccounts", { failOnStatusCode: false });

    cy.location("pathname", { timeout: 10000 }).should("equal", "/signin");
    cy.getBySel("signin-username").should("be.visible");

    cy.screenshot("evidencias/flujo-1-autenticacion/TC-AUTH-003");
  });

  it("TC-AUTH-CB-001 (Caja Blanca - Rama True !user): Manejo de usuario inexistente en capa API", () => {
    cy.request({
      method: "POST",
      url: `${backendUrl}/login`,
      body: {
        username: "UsuarioFantasma_999",
        password: "password",
      },
      failOnStatusCode: false,
    }).then((response) => {
      expect(response.status).to.equal(401);
    });

    // Validar reflejo en UI
    cy.visit("/signin");
    cy.getBySel("signin-username").type("UsuarioFantasma_999");
    cy.getBySel("signin-password").type("password");
    cy.getBySel("signin-submit").click();
    cy.getBySel("signin-error").should("be.visible");

    cy.screenshot("evidencias/flujo-1-autenticacion/TC-AUTH-CB-001");
  });

  it("TC-AUTH-CB-002 (Caja Blanca - Rama False !user): Autenticación exitosa y generación de sesión en capa API", () => {
    cy.request({
      method: "POST",
      url: `${backendUrl}/login`,
      body: {
        username: "Katharina_Bernier",
        password: "s3cret",
      },
    }).then((response) => {
      expect(response.status).to.equal(200);
      expect(response.body).to.have.property("user");
      expect(response.body.user.username).to.equal("Katharina_Bernier");
      expect(response.headers).to.have.property("set-cookie");
    });

    cy.visit("/signin");
    cy.getBySel("signin-username").should("be.visible");

    cy.screenshot("evidencias/flujo-1-autenticacion/TC-AUTH-CB-002");
  });

  it("TC-EXP-AUTH-001 (Experiencia - Error Guessing / Trim): Tratamiento de espacios accidentales en username", () => {
    cy.visit("/signin");

    // Usuario digita espacios adicionales accidentales
    cy.getBySel("signin-username").type("  Katharina_Bernier  ");
    cy.getBySel("signin-password").type("s3cret");
    cy.getBySel("signin-submit").click();

    // RWA valida contra base de datos sin auto-trim automático en UI, capturando el estado de rechazo
    cy.getBySel("signin-error").should("be.visible");
    cy.location("pathname").should("equal", "/signin");

    cy.screenshot("evidencias/flujo-1-autenticacion/TC-EXP-AUTH-001");
  });

  it("TC-EXP-AUTH-002 (Experiencia - Invalidez de Sesión / Logout): Verificación de invalidación de token y cierre de sesión", () => {
    cy.login("Katharina_Bernier", "s3cret");
    cy.location("pathname").should("equal", "/");
    cy.getBySel("sidenav-user-balance").should("be.visible");

    // Cerrar sesión
    cy.getBySel("sidenav-signout").click();
    cy.location("pathname").should("equal", "/signin");

    // Intentar navegar directamente a una ruta protegida
    cy.visit("/bankaccounts", { failOnStatusCode: false });
    cy.location("pathname", { timeout: 10000 }).should("equal", "/signin");
    cy.getBySel("signin-username").should("be.visible");

    cy.screenshot("evidencias/flujo-1-autenticacion/TC-EXP-AUTH-002");
  });
});
