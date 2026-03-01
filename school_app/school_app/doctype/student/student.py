import frappe
from frappe.model.document import Document

class Student(Document):

	def before_save(self):
		self.full_name = " ".join(filter(None, [
			self.first_name,
			self.second_name,
			self.last_name
		]))

	def after_insert(self):
		frappe.msgprint(
			f"✅ Student <b>{self.student_reg_no}</b> created successfully.",
			alert=True
		)
