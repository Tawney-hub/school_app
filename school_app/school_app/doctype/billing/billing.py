import frappe
from frappe.model.document import Document

class Billing(Document):

    def validate(self):
        self.update_student_count()
        self.calculate_amounts()

    def update_student_count(self):
        filters = {"student_class": self.student_class, "status": "Active"}
        if self.section:
            filters["section"] = self.section
        self.number_of_students = frappe.db.count("Student", filters=filters)

    def calculate_amounts(self):
        total = 0
        for item in self.items:
            item.amount = (item.rate or 0) * (item.qty or 0)
            total += item.amount
        self.total_amount = total

    def on_submit(self):
        self.create_student_invoices()
        frappe.msgprint(
            f"✅ Billing <b>{self.name}</b> submitted successfully.",
            alert=True
        )

    def create_student_invoices(self):
        filters = {"student_class": self.student_class, "status": "Active"}
        if self.section:
            filters["section"] = self.section

        students = frappe.get_all("Student", filters=filters,
            fields=["name", "student_reg_no", "first_name", "last_name"])

        if not students:
            frappe.msgprint("⚠️ No active students found for this class/section.", alert=True)
            return

        created = 0
        for student in students:
            # Check if customer exists for student, create if not
            customer = self.get_or_create_customer(student)

            # Build invoice items
            items = []
            for item in self.items:
                items.append({
                    "item_code": item.item_code,
                    "item_name": item.item_name,
                    "qty": item.qty,
                    "rate": item.rate,
                    "amount": item.amount
                })

            inv = frappe.get_doc({
                "doctype": "Sales Invoice",
                "customer": customer,
                "posting_date": self.date,
                "due_date": self.date,
                "cost_center": self.cost_center,
                "project": self.project,
                "fees_structure": self.fees_structure,
                "custom_billing": self.name,
                "custom_student": student["name"],
                "items": items
            })
            inv.insert(ignore_permissions=True)
            inv.submit()
            created += 1

        frappe.msgprint(
            f"✅ Created and submitted <b>{created}</b> Sales Invoices for students.",
            alert=True
        )

    def get_or_create_customer(self, student):
        full_name = f"{student['first_name']} {student['last_name']}"
        reg_no = student["student_reg_no"]
        customer_name = f"{reg_no} - {full_name}"

        if frappe.db.exists("Customer", customer_name):
            return customer_name

        customer = frappe.get_doc({
            "doctype": "Customer",
            "customer_name": customer_name,
            "customer_type": "Individual",
            "customer_group": "Individual",
            "territory": "All Territories"
        })
        customer.insert(ignore_permissions=True)
        return customer_name
