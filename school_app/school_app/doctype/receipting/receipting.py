import frappe
from frappe.model.document import Document

class Receipting(Document):

    def validate(self):
        self.load_invoice_details()
        self.validate_allocated()
        self.set_cash_account_if_missing()

    def set_cash_account_if_missing(self):
        if not self.bank_cash_account:
            company      = frappe.defaults.get_global_default("company")
            account_type = "Cash" if self.payment_mode == "Cash" else "Bank"
            account      = frappe.db.get_value("Account", {
                "company": company,
                "account_type": account_type,
                "is_group": 0
            }, "name")
            if account:
                self.bank_cash_account = account

    def load_invoice_details(self):
        for row in self.invoices:
            if row.invoice_number:
                inv            = frappe.get_doc("Sales Invoice", row.invoice_number)
                row.fees_structure = inv.get("fees_structure") or ""
                row.total          = inv.grand_total
                row.outstanding    = inv.outstanding_amount

    def validate_allocated(self):
        total_allocated = sum(row.allocated or 0 for row in self.invoices)
        if not self.total_paid:
            self.total_paid = total_allocated
        if round(total_allocated, 2) != round(self.total_paid, 2):
            frappe.throw(
                f"Total Allocated <b>{total_allocated}</b> does not match "
                f"Total Paid <b>{self.total_paid}</b>. Please adjust allocated amounts or click Auto Distribute."
            )

    def on_submit(self):
        self.create_payment_entry()
        frappe.msgprint("✅ Receipting submitted and payment created.", alert=True)

    def create_payment_entry(self):
        rows = [r for r in self.invoices if r.allocated and r.allocated > 0]
        if not rows:
            frappe.throw("No allocated amounts found. Please allocate amounts before submitting.")

        company            = frappe.defaults.get_global_default("company")
        company_currency   = frappe.get_value("Company", company, "default_currency")
        receivable_account = frappe.get_value("Company", company, "default_receivable_account")
        paid_to_account    = self.bank_cash_account
        paid_to_currency   = frappe.get_value("Account", paid_to_account, "account_currency") or company_currency

        first_inv  = frappe.get_doc("Sales Invoice", rows[0].invoice_number)
        total_paid = self.total_paid or sum(r.allocated for r in rows)

        references = []
        for row in rows:
            references.append({
                "reference_doctype":  "Sales Invoice",
                "reference_name":     row.invoice_number,
                "fees_structure":     row.fees_structure or "",
                "total_amount":       row.total,
                "outstanding_amount": row.outstanding,
                "allocated_amount":   row.allocated
            })

        pe = frappe.get_doc({
            "doctype":                    "Payment Entry",
            "payment_type":               self.payment_type,
            "party_type":                 self.party_type,
            "party":                      first_inv.customer,
            "party_name":                 first_inv.customer,
            "custom_payment_mode":        self.payment_mode,
            "custom_student":             self.student_name,
            "custom_receipting":          self.name,
            "company":                    company,
            "posting_date":               self.date,
            "paid_from":                  receivable_account,
            "paid_to":                    paid_to_account,
            "paid_from_account_currency": company_currency,
            "paid_to_account_currency":   paid_to_currency,
            "source_exchange_rate":       1,
            "target_exchange_rate":       1,
            "paid_amount":                total_paid,
            "received_amount":            total_paid,
            "references":                 references,
            "reference_no":               self.name,
            "reference_date":             self.date
        })
        pe.insert(ignore_permissions=True)
        pe.submit()
        frappe.msgprint(f"✅ Payment Entry <b>{pe.name}</b> created.", alert=True)


@frappe.whitelist()
@frappe.validate_and_sanitize_search_inputs
def search_students(doctype, txt, searchfield, start, page_len, filters):
    student_class = filters.get("student_class", "") if isinstance(filters, dict) else ""
    section       = filters.get("section", "")       if isinstance(filters, dict) else ""

    conditions = "AND s.status = 'Active'"
    values     = {"txt": f"%{txt}%", "page_len": page_len, "start": start}

    if student_class:
        conditions += " AND s.student_class = %(student_class)s"
        values["student_class"] = student_class
    if section:
        conditions += " AND s.section = %(section)s"
        values["section"] = section

    return frappe.db.sql(f"""
        SELECT
            s.name,
            TRIM(CONCAT(
                s.first_name, ' ',
                COALESCE(s.second_name, ''), ' ',
                s.last_name
            )) as full_name
        FROM `tabStudent` s
        WHERE (
            s.name LIKE %(txt)s
            OR s.first_name LIKE %(txt)s
            OR s.last_name LIKE %(txt)s
            OR CONCAT(s.first_name, ' ', s.last_name) LIKE %(txt)s
            OR TRIM(CONCAT(s.first_name, ' ', COALESCE(s.second_name,''), ' ', s.last_name)) LIKE %(txt)s
        )
        {conditions}
        LIMIT %(page_len)s OFFSET %(start)s
    """, values)
